/**
 * NAS 폴더 휴지통 이동 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { FolderAvailabilityStatus } from '../../../domain/folder';
import { FolderNasStorageObjectDomainService } from '../../../domain/storage/folder/service/folder-nas-storage-object-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFolderTrashJobData } from '../nas-folder-sync.worker';

@Injectable()
export class FolderTrashHandler {
  private readonly logger = new Logger(FolderTrashHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly folderNasStorageDomainService: FolderNasStorageObjectDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFolderTrashJobData>): Promise<void> {
    const { folderId, currentPath, trashPath, syncEventId } = job.data;
    this.logger.debug(`폴더 휴지통 이동 처리 시작: ${folderId}, ${currentPath} -> ${trashPath}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const storageObject = await this.folderNasStorageDomainService.조회(folderId);

      if (!storageObject) {
        this.logger.warn(`폴더 스토리지 객체를 찾을 수 없음: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (storageObject.isAvailable() && storageObject.objectKey === trashPath) {
        this.logger.debug(`이미 NAS 휴지통으로 이동된 폴더: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      try {
        await this.nasStorage.폴더이동(currentPath, trashPath);
      } catch (nasError: any) {
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`폴더 휴지통 이동 이미 완료됨 (멱등성): ${currentPath} -> ${trashPath}`);
        } else {
          throw nasError;
        }
      }

      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(trashPath);
      await this.folderNasStorageDomainService.저장(storageObject);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 폴더 휴지통 이동 완료: ${folderId}, ${currentPath} -> ${trashPath}`);
    } catch (error) {
      this.logger.error(`NAS 폴더 휴지통 이동 실패: ${folderId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=trash | folderId=${folderId}`,
      );
      throw error;
    }
  }
}
