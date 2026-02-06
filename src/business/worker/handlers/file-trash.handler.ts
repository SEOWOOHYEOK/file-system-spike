/**
 * NAS 파일 휴지통 이동 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { AvailabilityStatus } from '../../../domain/file';
import { FileNasStorageDomainService } from '../../../domain/storage/file/service/file-nas-storage-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFileTrashJobData } from '../nas-file-sync.worker';

@Injectable()
export class FileTrashHandler {
  private readonly logger = new Logger(FileTrashHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFileTrashJobData>): Promise<void> {
    const { fileId, currentObjectKey, trashPath, syncEventId } = job.data;
    this.logger.debug(`파일 휴지통 이동 처리 시작: ${fileId}, ${currentObjectKey} -> ${trashPath}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const nasObject = await this.fileNasStorageDomainService.조회(fileId);

      if (!nasObject) {
        this.logger.warn(`NAS 스토리지 객체를 찾을 수 없음: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable() && nasObject.objectKey === trashPath) {
        this.logger.debug(`이미 NAS 휴지통으로 이동된 파일: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (nasObject.leaseCount > 0) {
        this.logger.warn(`파일 다운로드 중, 나중에 재시도: ${fileId}, leaseCount: ${nasObject.leaseCount}`);
        throw new Error(`FILE_IN_USE: leaseCount=${nasObject.leaseCount}`);
      }

      try {
        await this.nasStorage.파일이동(currentObjectKey, trashPath);
      } catch (nasError: any) {
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`파일 휴지통 이동 이미 완료됨 (멱등성): ${currentObjectKey} -> ${trashPath}`);
        } else {
          throw nasError;
        }
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(trashPath);
      await this.fileNasStorageDomainService.저장(nasObject);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 파일 휴지통 이동 완료: ${fileId}, ${currentObjectKey} -> ${trashPath}`);
    } catch (error) {
      this.logger.error(`NAS 파일 휴지통 이동 실패: ${fileId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=trash | fileId=${fileId}`,
      );
      throw error;
    }
  }
}
