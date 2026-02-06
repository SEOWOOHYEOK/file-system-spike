/**
 * NAS 폴더 생성 핸들러
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
import type { NasFolderMkdirJobData } from '../nas-folder-sync.worker';

@Injectable()
export class FolderMkdirHandler {
  private readonly logger = new Logger(FolderMkdirHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly folderNasStorageDomainService: FolderNasStorageObjectDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFolderMkdirJobData>): Promise<void> {
    const { folderId, path, syncEventId } = job.data;
    this.logger.debug(`폴더 생성 처리 시작: ${folderId}, path: ${path}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const storageObject = await this.folderNasStorageDomainService.조회(folderId);

      if (!storageObject) {
        this.logger.warn(`폴더 스토리지 객체를 찾을 수 없음: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (storageObject.isAvailable()) {
        this.logger.debug(`이미 NAS에 생성된 폴더: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      try {
        await this.nasStorage.폴더생성(path);
      } catch (nasError: any) {
        if (nasError.code !== 'EEXIST' && !nasError.message?.includes('already exists')) {
          throw nasError;
        }
        this.logger.debug(`NAS에 폴더가 이미 존재함 (멱등성): ${path}`);
      }

      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(path);
      await this.folderNasStorageDomainService.저장(storageObject);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 폴더 생성 완료: ${folderId} -> ${path}`);
    } catch (error) {
      this.logger.error(`NAS 폴더 생성 실패: ${folderId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=mkdir | folderId=${folderId}`,
      );
      throw error;
    }
  }
}
