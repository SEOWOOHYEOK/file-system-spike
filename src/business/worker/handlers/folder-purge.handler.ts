/**
 * NAS 폴더 영구 삭제 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { FolderDomainService } from '../../../domain/folder/service/folder-domain.service';
import { FolderNasStorageObjectDomainService } from '../../../domain/storage/folder/service/folder-nas-storage-object-domain.service';
import { TrashDomainService } from '../../../domain/trash/service/trash-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFolderPurgeJobData } from '../nas-folder-sync.worker';

@Injectable()
export class FolderPurgeHandler {
  private readonly logger = new Logger(FolderPurgeHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly folderDomainService: FolderDomainService,
    private readonly folderNasStorageDomainService: FolderNasStorageObjectDomainService,
    private readonly trashDomainService: TrashDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFolderPurgeJobData>): Promise<void> {
    const { folderId, trashPath, trashMetadataId, syncEventId } = job.data;
    this.logger.debug(`폴더 영구 삭제 처리 시작: ${folderId}, trashPath: ${trashPath}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const folder = await this.folderDomainService.조회(folderId);
      if (!folder) {
        this.logger.warn(`영구 삭제할 폴더를 찾을 수 없음: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      const storageObject = await this.folderNasStorageDomainService.조회(folderId);

      try {
        await this.nasStorage.폴더삭제(trashPath);
        this.logger.debug(`NAS에서 폴더 삭제 완료: ${trashPath}`);
      } catch (deleteError) {
        this.logger.warn(`NAS에서 폴더가 이미 삭제되었을 수 있음: ${trashPath}`, deleteError);
      }

      if (storageObject) {
        await this.folderNasStorageDomainService.삭제(storageObject.id);
      }

      folder.permanentDelete();
      await this.folderDomainService.저장(folder);

      await this.trashDomainService.삭제(trashMetadataId);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 폴더 영구 삭제 완료: ${folderId}, trashPath: ${trashPath}`);
    } catch (error) {
      this.logger.error(`NAS 폴더 영구 삭제 실패: ${folderId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=purge | folderId=${folderId}`,
      );
      throw error;
    }
  }
}
