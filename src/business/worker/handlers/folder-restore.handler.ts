/**
 * NAS 폴더 복원(휴지통 → 원래 경로) 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { FolderAvailabilityStatus } from '../../../domain/folder';
import { FolderDomainService } from '../../../domain/folder/service/folder-domain.service';
import { FolderNasStorageObjectDomainService } from '../../../domain/storage/folder/service/folder-nas-storage-object-domain.service';
import { TrashDomainService } from '../../../domain/trash/service/trash-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFolderRestoreJobData } from '../nas-folder-sync.worker';

@Injectable()
export class FolderRestoreHandler {
  private readonly logger = new Logger(FolderRestoreHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly folderDomainService: FolderDomainService,
    private readonly folderNasStorageDomainService: FolderNasStorageObjectDomainService,
    private readonly trashDomainService: TrashDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFolderRestoreJobData>): Promise<void> {
    const { folderId, trashPath, restorePath, trashMetadataId, originalParentId, syncEventId } = job.data;
    this.logger.debug(`폴더 복원 처리 시작: ${folderId}, ${trashPath} -> ${restorePath}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const storageObject = await this.folderNasStorageDomainService.조회(folderId);

      if (!storageObject) {
        this.logger.warn(`폴더 스토리지 객체를 찾을 수 없음: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (storageObject.isAvailable() && storageObject.objectKey === restorePath) {
        this.logger.debug(`이미 NAS에서 복원된 폴더: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      const folder = await this.folderDomainService.조회(folderId);
      if (!folder) {
        this.logger.warn(`복원할 폴더를 찾을 수 없음: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      try {
        await this.nasStorage.폴더이동(trashPath, restorePath);
      } catch (nasError: any) {
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`폴더 복원 이미 완료됨 (멱등성): ${trashPath} -> ${restorePath}`);
        } else {
          throw nasError;
        }
      }

      if (folder.isTrashed()) {
        folder.restore();
        folder.moveTo(originalParentId || folder.parentId!, restorePath);
        await this.folderDomainService.저장(folder);
      }

      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(restorePath);
      await this.folderNasStorageDomainService.저장(storageObject);

      await this.trashDomainService.삭제(trashMetadataId);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 폴더 복원 완료: ${folderId}, ${trashPath} -> ${restorePath}`);
    } catch (error) {
      this.logger.error(`NAS 폴더 복원 실패: ${folderId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=restore | folderId=${folderId}`,
      );
      throw error;
    }
  }
}
