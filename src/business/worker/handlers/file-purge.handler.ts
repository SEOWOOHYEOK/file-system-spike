/**
 * NAS 파일 영구 삭제 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  CACHE_STORAGE_PORT,
} from '../../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { FileDomainService } from '../../../domain/file/service/file-domain.service';
import { FileNasStorageDomainService } from '../../../domain/storage/file/service/file-nas-storage-domain.service';
import { FileCacheStorageDomainService } from '../../../domain/storage/file/service/file-cache-storage-domain.service';
import { TrashDomainService } from '../../../domain/trash/service/trash-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { ICacheStoragePort } from '../../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFilePurgeJobData } from '../nas-file-sync.worker';

@Injectable()
export class FilePurgeHandler {
  private readonly logger = new Logger(FilePurgeHandler.name);

  constructor(
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly fileDomainService: FileDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly trashDomainService: TrashDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFilePurgeJobData>): Promise<void> {
    const { fileId, syncEventId, trashMetadataId } = job.data;
    this.logger.debug(`파일 영구 삭제 처리 시작: ${fileId}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      // 1. 파일 조회
      const file = await this.fileDomainService.조회(fileId);
      if (!file) {
        this.logger.warn(`영구 삭제할 파일을 찾을 수 없음: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      // 2. 캐시 스토리지 에서 파일 삭제
      const cacheObject = await this.fileCacheStorageDomainService.조회(fileId);

      if (cacheObject) {
        try {
          await this.cacheStorage.파일삭제(cacheObject.objectKey);
          await this.fileCacheStorageDomainService.삭제(cacheObject.id);
          this.logger.debug(`캐시 객체 삭제 완료: ${cacheObject.objectKey}`);
        } catch (cacheError) { 
          this.logger.warn(`캐시 삭제 실패 (계속 진행): ${fileId}`, cacheError);
        }
      }

      // 3. NAS에서 파일 삭제
      const nasObject = await this.fileNasStorageDomainService.조회(fileId);

      if (nasObject) {
        try {
          await this.nasStorage.파일삭제(nasObject.objectKey);
          await this.fileNasStorageDomainService.삭제(nasObject.id);
          this.logger.debug(`NAS 객체 삭제 완료: ${nasObject.objectKey}`);
        } catch (nasError) {
          this.logger.error(`NAS 삭제 실패: ${fileId}`, nasError);
          await this.syncEventHelper.markFailed(
            syncEvent,
            `NAS_DELETE_ERROR: ${(nasError as Error).message}`,
          );
          throw nasError;
        }
      }

      // 4. 파일 상태를 DELETED로 변경
      file.permanentDelete();
      await this.fileDomainService.저장(file);
      if (file.isTrashed()) {
        file.permanentDelete();
        await this.fileDomainService.저장(file);
      }

      // 5. 휴지통 메타데이터 삭제 (있는 경우)
      if (trashMetadataId) {
        await this.trashDomainService.삭제(trashMetadataId);
      }

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`파일 영구 삭제 완료: fileId=${fileId}`);
    } catch (error) {
      this.logger.error(`파일 영구 삭제 실패: ${fileId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=purge | fileId=${fileId}`,
      );
      throw error;
    }
  }
}
