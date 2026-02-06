/**
 * NAS 파일 업로드 핸들러
 *
 * 파일 크기에 따라 전략 분기:
 * - 소용량 (< 100MB): 스트림 방식 + 진행률 로깅
 * - 대용량 (>= 100MB): 청크 병렬 업로드 + 진행률 로깅
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PROGRESS_STORAGE_PORT,
  type IProgressStoragePort,
} from '../../../domain/queue/ports/progress-storage.port';
import {
  CACHE_STORAGE_PORT,
} from '../../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { AvailabilityStatus } from '../../../domain/file';
import { FileDomainService } from '../../../domain/file/service/file-domain.service';
import { FileNasStorageDomainService } from '../../../domain/storage/file/service/file-nas-storage-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import { createProgressStream, createProgressLogger, formatBytes } from '../../../common/utils';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { ICacheStoragePort } from '../../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFileUploadJobData } from '../nas-file-sync.worker';
import { PARALLEL_UPLOAD_CONFIG } from '../nas-file-sync.worker';

@Injectable()
export class FileUploadHandler {
  private readonly logger = new Logger(FileUploadHandler.name);

  constructor(
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    @Inject(PROGRESS_STORAGE_PORT)
    private readonly progressStorage: IProgressStoragePort,
    private readonly fileDomainService: FileDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFileUploadJobData>): Promise<void> {
    const { fileId, syncEventId } = job.data;
    this.logger.debug(`파일 업로드 처리 시작: ${fileId}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const nasObject = await this.fileNasStorageDomainService.조회(fileId);

      if (!nasObject) {
        this.logger.warn(`NAS 스토리지 객체를 찾을 수 없음: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable()) {
        this.logger.debug(`이미 NAS에 동기화된 파일: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      const file = await this.fileDomainService.조회(fileId);
      if (!file) {
        this.logger.warn(`파일을 찾을 수 없음: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      const objectKey = syncEvent?.targetPath || fileId;
      const fileSize = file.sizeBytes;
      const shortFileId = fileId.substring(0, 8);
      const totalChunks = Math.ceil(fileSize / PARALLEL_UPLOAD_CONFIG.CHUNK_SIZE);

      // 진행률 초기화 (syncEventId가 있는 경우에만)
      if (syncEventId) {
        await this.progressStorage.set(syncEventId, {
          fileId,
          syncEventId,
          eventType: 'CREATE',
          status: 'PROCESSING',
          progress: {
            percent: 0,
            completedChunks: 0,
            totalChunks,
            bytesTransferred: 0,
            totalBytes: fileSize,
          },
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // 파일 크기에 따른 전략 분기
      if (fileSize >= PARALLEL_UPLOAD_CONFIG.THRESHOLD_BYTES) {
        this.logger.log(
          `[PARALLEL_UPLOAD] 🚀 병렬 업로드 시작 | file=${shortFileId}... | ` +
          `size=${formatBytes(fileSize)} | chunks=${Math.ceil(fileSize / PARALLEL_UPLOAD_CONFIG.CHUNK_SIZE)}`,
        );
        await this.parallelUploadToNas(fileId, objectKey, fileSize, syncEventId);
      } else {
        this.logger.log(
          `[STREAM_UPLOAD] 🚀 스트림 업로드 시작 | file=${shortFileId}... | ` +
          `size=${formatBytes(fileSize)}`,
        );
        await this.streamUploadToNas(fileId, objectKey, fileSize);
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(objectKey);
      await this.fileNasStorageDomainService.저장(nasObject);

      // 진행률 완료 업데이트
      if (syncEventId) {
        await this.progressStorage.update(syncEventId, {
          status: 'DONE',
          progress: {
            percent: 100,
            completedChunks: totalChunks,
            totalChunks,
            bytesTransferred: fileSize,
            totalBytes: fileSize,
          },
        });
      }

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(
        `[SYNC_COMPLETE] ✅ NAS 동기화 완료 | file=${shortFileId}... | ` +
        `size=${formatBytes(fileSize)} | path=${objectKey}`,
      );
    } catch (error) {
      this.logger.error(`NAS 파일 동기화 실패: ${fileId}`, error);

      if (syncEventId) {
        await this.progressStorage.update(syncEventId, {
          status: 'FAILED',
          error: (error as Error).message,
        });
      }

      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=upload | fileId=${fileId}`,
      );
      throw error;
    }
  }

  /**
   * 스트림 방식 업로드 (소용량 파일용)
   */
  private async streamUploadToNas(
    fileId: string,
    objectKey: string,
    fileSize: number,
  ): Promise<void> {
    const readStream = await this.cacheStorage.파일스트림읽기(fileId);

    const { callback: progressCallback } = createProgressLogger(
      this.logger,
      fileId,
      'NAS_SYNC',
      PARALLEL_UPLOAD_CONFIG.PROGRESS_LOG_INTERVAL,
    );

    const progressStream = createProgressStream(fileSize, progressCallback);
    await this.nasStorage.파일스트림쓰기(objectKey, readStream.pipe(progressStream));
  }

  /**
   * 청크 병렬 업로드 (대용량 파일용)
   */
  private async parallelUploadToNas(
    fileId: string,
    objectKey: string,
    fileSize: number,
    syncEventId?: string,
  ): Promise<void> {
    const { CHUNK_SIZE, PARALLEL_CHUNKS, PROGRESS_LOG_INTERVAL } = PARALLEL_UPLOAD_CONFIG;
    const shortFileId = fileId.substring(0, 8);

    await this.nasStorage.파일사전할당(objectKey, fileSize);

    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const chunks: Array<{ index: number; start: number; end: number }> = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
      chunks.push({ index: i, start, end });
    }

    let completedChunks = 0;
    let lastLoggedPercent = 0;

    const processChunk = async (chunk: { index: number; start: number; end: number }) => {
      const { start, end } = chunk;

      const chunkStream = await this.cacheStorage.파일범위스트림읽기(fileId, start, end);

      const buffers: Buffer[] = [];
      for await (const data of chunkStream) {
        buffers.push(data);
      }
      const chunkBuffer = Buffer.concat(buffers);

      await this.nasStorage.청크쓰기(objectKey, chunkBuffer, start);

      completedChunks++;
      const percent = Math.round((completedChunks / totalChunks) * 100);
      const bytesTransferred = Math.min(completedChunks * CHUNK_SIZE, fileSize);

      if (percent >= lastLoggedPercent + PROGRESS_LOG_INTERVAL || percent === 100) {
        if (syncEventId) {
          await this.progressStorage.update(syncEventId, {
            status: 'PROCESSING',
            progress: {
              percent,
              completedChunks,
              totalChunks,
              bytesTransferred,
              totalBytes: fileSize,
            },
          });
        }

        this.logger.log(
          `[PARALLEL_UPLOAD] 📊 진행률 | file=${shortFileId}... | ${percent}% | ` +
          `chunks=${completedChunks}/${totalChunks}`,
        );
        lastLoggedPercent = Math.floor(percent / PROGRESS_LOG_INTERVAL) * PROGRESS_LOG_INTERVAL;
      }
    };

    const executeInBatches = async () => {
      for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
        const batch = chunks.slice(i, i + PARALLEL_CHUNKS);
        await Promise.all(batch.map(processChunk));
      }
    };

    await executeInBatches();

    this.logger.log(
      `[PARALLEL_UPLOAD] ✅ 전체 청크 업로드 완료 | file=${shortFileId}... | ` +
      `totalChunks=${totalChunks}`,
    );
  }
}
