/**
 * NAS 폴더 이동 핸들러
 *
 * 2차 방어: 대상 폴더가 삭제된 경우 원복 처리
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import { buildPath } from '../../../common/utils';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { FolderAvailabilityStatus } from '../../../domain/folder';
import { FolderDomainService } from '../../../domain/folder/service/folder-domain.service';
import { FolderNasStorageObjectDomainService } from '../../../domain/storage/folder/service/folder-nas-storage-object-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFolderMoveJobData } from '../nas-folder-sync.worker';

@Injectable()
export class FolderMoveHandler {
  private readonly logger = new Logger(FolderMoveHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly folderDomainService: FolderDomainService,
    private readonly folderNasStorageDomainService: FolderNasStorageObjectDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFolderMoveJobData>): Promise<void> {
    const { folderId, oldPath, newPath, originalParentId, targetParentId, syncEventId } = job.data;
    this.logger.debug(`폴더 이동 처리 시작: ${folderId}, ${oldPath} -> ${newPath}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const storageObject = await this.folderNasStorageDomainService.조회(folderId);

      if (!storageObject) {
        this.logger.warn(`폴더 스토리지 객체를 찾을 수 없음: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (storageObject.isAvailable() && storageObject.objectKey === newPath) {
        this.logger.debug(`이미 NAS에서 이동된 폴더: ${folderId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      // 2차 방어: 대상 부모 폴더 존재 여부 확인
      const targetParent = await this.folderDomainService.조회(targetParentId);

      if (!targetParent || !targetParent.isActive()) {
        this.logger.warn(`대상 부모 폴더가 삭제됨, 폴더 이동 원복 처리: ${folderId}`);

        const folder = await this.folderDomainService.조회(folderId);
        if (folder && originalParentId) {
          const originalParent = await this.folderDomainService.조회(originalParentId);
          if (originalParent) {
            const revertPath = buildPath(originalParent.path, folder.name);
            folder.moveTo(originalParentId, revertPath);
            await this.folderDomainService.저장(folder);
          }
        }

        storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
        await this.folderNasStorageDomainService.저장(storageObject);

        await this.syncEventHelper.markDone(syncEvent);
        this.logger.warn(`대상 부모 폴더 삭제로 폴더 이동 원복 완료: ${folderId}`);
        return;
      }

      try {
        await this.nasStorage.폴더이동(oldPath, newPath);
      } catch (nasError: any) {
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`폴더 이동 이미 완료됨 (멱등성): ${oldPath} -> ${newPath}`);
        } else {
          throw nasError;
        }
      }

      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(newPath);
      await this.folderNasStorageDomainService.저장(storageObject);

      // 하위 폴더들의 objectKey도 업데이트
      await this.updateDescendantStorageKeys(oldPath, newPath);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 폴더 이동 완료: ${folderId}, ${oldPath} -> ${newPath}`);
    } catch (error) {
      this.logger.error(`NAS 폴더 이동 실패: ${folderId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=move | folderId=${folderId}`,
      );
      throw error;
    }
  }

  private async updateDescendantStorageKeys(oldPathPrefix: string, newPathPrefix: string): Promise<void> {
    try {
      const updatedCount = await this.folderNasStorageDomainService.경로접두사일괄변경(
        oldPathPrefix + '/',
        oldPathPrefix,
        newPathPrefix,
      );
      this.logger.debug(`하위 폴더 스토리지 키 ${updatedCount}개 업데이트 완료: ${oldPathPrefix} -> ${newPathPrefix}`);
    } catch (error) {
      this.logger.warn(`하위 폴더 스토리지 키 업데이트 실패: ${error}`);
    }
  }
}
