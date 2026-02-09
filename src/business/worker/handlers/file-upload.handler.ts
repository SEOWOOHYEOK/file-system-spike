/**
 * NAS 파일 업로드 핸들러
 *
 * 파일 크기에 따라 전략 분기:
 * - 소용량 (< 100MB): 스트림 방식 + 진행률 로깅
 * - 대용량 (>= 100MB): 청크 병렬 업로드 + 진행률 로깅
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { PassThrough } from 'stream';
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
import { FileCacheStorageDomainService } from '../../../domain/storage/file/service/file-cache-storage-domain.service';
import { UploadSessionDomainService } from '../../../domain/upload-session/service/upload-session-domain.service';
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
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly uploadSessionDomainService: UploadSessionDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFileUploadJobData>): Promise<void> {
    const { fileId, syncEventId, multipartSessionId, compositeChecksum } = job.data;
    this.logger.debug(`파일 업로드 처리 시작: ${fileId}${multipartSessionId ? ' (multipart)' : ''}`);

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

      // 진행률 초기화 (syncEventId가 있는 경우에만, 실패해도 주 작업은 계속)
      if (syncEventId) {
        try {
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
        } catch (progressError) {
          this.logger.warn(
            `진행률 초기화 실패 (업로드는 계속 진행): ${(progressError as Error).message}`,
          );
        }
      }

      if (multipartSessionId) {
        // === 멀티파트 경로: 파트에서 직접 NAS 업로드 ===
        this.logger.log(
          `[MULTIPART_UPLOAD] 파트 기반 NAS 업로드 시작 | file=${shortFileId}... | ` +
          `size=${formatBytes(fileSize)} | session=${multipartSessionId.substring(0, 8)}...`,
        );
        await this.uploadToNasFromParts(multipartSessionId, objectKey, fileSize, syncEventId);

        // NAS 상태 업데이트
        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        nasObject.updateObjectKey(objectKey);
        await this.fileNasStorageDomainService.저장(nasObject);

        // 파트 → 캐시 단일 파일 concat + SHA-256 동시 계산
        this.logger.log(
          `[MULTIPART_CONCAT] 파트 → 캐시 파일 concat 시작 | file=${shortFileId}...`,
        );
        const realChecksum = await this.concatPartsToCache(multipartSessionId, fileId);

        // NAS 스토리지 체크섬을 실제 SHA-256으로 갱신
        nasObject.updateChecksum(realChecksum);
        await this.fileNasStorageDomainService.저장(nasObject);

        // 캐시 스토리지 객체 생성 (실제 SHA-256 사용)
        await this.fileCacheStorageDomainService.생성({
          id: uuidv4(),
          fileId,
          checksum: realChecksum,
        });

        this.logger.log(
          `[MULTIPART_CONCAT] 캐시 파일 생성 완료 | file=${shortFileId}... | ` +
          `sha256=${realChecksum.substring(0, 12)}...`,
        );

        // 세션 완료 + 파트 파일 삭제
        await this.finalizeMultipartSession(multipartSessionId, fileId);
      } else {
        // === 기존 경로: 캐시 파일에서 NAS 업로드 ===
        if (fileSize >= PARALLEL_UPLOAD_CONFIG.THRESHOLD_BYTES) {
          this.logger.log(
            `[PARALLEL_UPLOAD] 병렬 업로드 시작 | file=${shortFileId}... | ` +
            `size=${formatBytes(fileSize)} | chunks=${totalChunks}`,
          );
          await this.parallelUploadToNas(fileId, objectKey, fileSize, syncEventId);
        } else {
          this.logger.log(
            `[STREAM_UPLOAD] 스트림 업로드 시작 | file=${shortFileId}... | ` +
            `size=${formatBytes(fileSize)}`,
          );
          await this.streamUploadToNas(fileId, objectKey, fileSize);
        }

        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        nasObject.updateObjectKey(objectKey);
        await this.fileNasStorageDomainService.저장(nasObject);
      }

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
        `[SYNC_COMPLETE] NAS 동기화 완료 | file=${shortFileId}... | ` +
        `size=${formatBytes(fileSize)} | path=${objectKey}${multipartSessionId ? ' | multipart' : ''}`,
      );
    } catch (error) {
      this.logger.error(`NAS 파일 동기화 실패: ${fileId}`, error);

      if (syncEventId) {
        try {
          await this.progressStorage.update(syncEventId, {
            status: 'FAILED',
            error: (error as Error).message,
          });
        } catch (progressError) {
          this.logger.warn(
            `진행률 실패 업데이트 실패: ${(progressError as Error).message}`,
          );
        }
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
      `[PARALLEL_UPLOAD] 전체 청크 업로드 완료 | file=${shortFileId}... | ` +
      `totalChunks=${totalChunks}`,
    );
  }

  /**
   * 멀티파트: 파트 파일에서 직접 NAS로 병렬 업로드
   *
   * 파트(10MB) → NAS 청크(50MB) 매핑:
   * - NAS 청크 1개 = 파트 5개 (50MB / 10MB)
   * - 파트를 순차 읽어 Buffer로 조합 → NAS 청크쓰기
   */
  private async uploadToNasFromParts(
    sessionId: string,
    objectKey: string,
    fileSize: number,
    syncEventId?: string,
  ): Promise<void> {
    const parts = await this.uploadSessionDomainService.완료파트목록조회(sessionId);
    const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
    const { CHUNK_SIZE, PARALLEL_CHUNKS, PROGRESS_LOG_INTERVAL } = PARALLEL_UPLOAD_CONFIG;
    const shortSessionId = sessionId.substring(0, 8);

    await this.nasStorage.파일사전할당(objectKey, fileSize);

    // 파트 크기 기반으로 NAS 청크 당 파트 수 계산
    const partSize = sortedParts[0]?.size || (10 * 1024 * 1024);
    const partsPerChunk = Math.ceil(CHUNK_SIZE / partSize);
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    let completedChunks = 0;
    let lastLoggedPercent = 0;

    const processChunk = async (chunkIndex: number) => {
      const startIdx = chunkIndex * partsPerChunk;
      const chunkParts = sortedParts.slice(startIdx, startIdx + partsPerChunk);

      const buffers: Buffer[] = [];
      for (const part of chunkParts) {
        if (!part.objectKey) continue;
        const stream = await this.cacheStorage.파일스트림읽기(part.objectKey);
        for await (const data of stream) {
          buffers.push(data);
        }
      }

      const offset = chunkIndex * CHUNK_SIZE;
      await this.nasStorage.청크쓰기(objectKey, Buffer.concat(buffers), offset);

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
          `[MULTIPART_UPLOAD] 진행률 | session=${shortSessionId}... | ${percent}% | ` +
          `chunks=${completedChunks}/${totalChunks}`,
        );
        lastLoggedPercent = Math.floor(percent / PROGRESS_LOG_INTERVAL) * PROGRESS_LOG_INTERVAL;
      }
    };

    // 배치 실행 (기존 패턴 동일)
    for (let i = 0; i < totalChunks; i += PARALLEL_CHUNKS) {
      const batch = Array.from(
        { length: Math.min(PARALLEL_CHUNKS, totalChunks - i) },
        (_, j) => i + j,
      );
      await Promise.all(batch.map(processChunk));
    }

    this.logger.log(
      `[MULTIPART_UPLOAD] NAS 업로드 완료 | session=${shortSessionId}... | ` +
      `totalChunks=${totalChunks}`,
    );
  }

  /**
   * 멀티파트: 파트를 로컬에서 concat하여 캐시 단일 파일 생성
   *
   * 추가 I/O 없이 concat 중 SHA-256을 동시 계산하여 반환.
   * SSD 기준 1GB당 ~1-2초 소요.
   *
   * @returns 실제 파일 바이너리의 SHA-256 해시
   */
  private async concatPartsToCache(sessionId: string, fileId: string): Promise<string> {
    const parts = await this.uploadSessionDomainService.완료파트목록조회(sessionId);
    const sorted = parts.sort((a, b) => a.partNumber - b.partNumber);

    const hash = createHash('sha256');
    const mergeStream = new PassThrough();
    const writePromise = this.cacheStorage.파일스트림쓰기(fileId, mergeStream);

    try {
      for (const part of sorted) {
        if (!part.objectKey) continue;

        const partStream = await this.cacheStorage.파일스트림읽기(part.objectKey);

        // backpressure 처리하며 파트 → mergeStream 전달 + SHA-256 동시 계산
        await new Promise<void>((resolve, reject) => {
          partStream.on('data', (chunk: Buffer) => {
            hash.update(chunk);
            if (!mergeStream.write(chunk)) {
              partStream.pause();
              mergeStream.once('drain', () => partStream.resume());
            }
          });
          partStream.on('end', resolve);
          partStream.on('error', reject);
        });
      }

      mergeStream.end();
      await writePromise;
    } catch (error) {
      if (!mergeStream.destroyed) {
        mergeStream.destroy();
      }
      throw error;
    }

    return hash.digest('hex');
  }

  /**
   * 멀티파트: 세션 완료 처리 + 파트 파일 삭제
   */
  private async finalizeMultipartSession(sessionId: string, fileId: string): Promise<void> {
    // 1. 세션 COMPLETING → COMPLETED
    const session = await this.uploadSessionDomainService.세션조회(sessionId);
    if (session?.isCompleting()) {
      session.complete(fileId);
      await this.uploadSessionDomainService.세션저장(session);
      this.logger.debug(`세션 완료 처리: ${sessionId}`);
    }

    // 2. 파트 파일 삭제
    const parts = await this.uploadSessionDomainService.완료파트목록조회(sessionId);
    for (const part of parts) {
      if (part.objectKey) {
        try {
          await this.cacheStorage.파일삭제(part.objectKey);
        } catch (e) {
          this.logger.warn(`파트 삭제 실패: ${part.objectKey} - ${(e as Error).message}`);
        }
      }
    }

    // 3. 세션 디렉토리 삭제 (cache/multipart/{sessionId}/)
    try {
      await this.cacheStorage.디렉토리삭제(`multipart/${sessionId}`);
    } catch (e) {
      this.logger.warn(`세션 디렉토리 삭제 실패: ${(e as Error).message}`);
    }

    this.logger.debug(`파트 파일 정리 완료: ${sessionId} (${parts.length}개)`);
  }
}
