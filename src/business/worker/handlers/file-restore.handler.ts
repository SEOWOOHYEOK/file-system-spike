/**
 * NAS 파일 복원(휴지통 → 원래 경로) 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { AvailabilityStatus } from '../../../domain/file';
import { FileDomainService } from '../../../domain/file/service/file-domain.service';
import { FileNasStorageDomainService } from '../../../domain/storage/file/service/file-nas-storage-domain.service';
import { FolderDomainService } from '../../../domain/folder/service/folder-domain.service';
import { TrashDomainService } from '../../../domain/trash/service/trash-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFileRestoreJobData } from '../nas-file-sync.worker';

@Injectable()
export class FileRestoreHandler {
  private readonly logger = new Logger(FileRestoreHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly fileDomainService: FileDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly trashDomainService: TrashDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFileRestoreJobData>): Promise<void> {
    const { fileId, syncEventId, trashMetadataId, restoreTargetFolderId } = job.data;
    this.logger.debug(`파일 복원 처리 시작: ${fileId}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      // 1. 휴지통 메타데이터 조회
      const trashMetadata = await this.trashDomainService.조회(trashMetadataId);
      if (!trashMetadata) {
        this.logger.warn(`휴지통 메타데이터를 찾을 수 없음: ${trashMetadataId}`);
        await this.syncEventHelper.markFailed(syncEvent, 'TRASH_METADATA_NOT_FOUND');
        return;
      }

      // 2. 파일 조회
      const file = await this.fileDomainService.조회(fileId);
      if (!file) {
        this.logger.warn(`파일을 찾을 수 없음: ${fileId}`);
        await this.syncEventHelper.markFailed(syncEvent, 'FILE_NOT_FOUND');
        return;
      }

      // 3. 대상 폴더 존재 여부 확인
      const targetFolder = await this.folderDomainService.조회(restoreTargetFolderId);
      if (!targetFolder || !targetFolder.isActive()) {
        this.logger.warn(`대상 폴더를 찾을 수 없거나 삭제됨: ${restoreTargetFolderId}`);
        await this.syncEventHelper.markFailed(syncEvent, 'TARGET_FOLDER_NOT_FOUND');
        return;
      }

      // 4. NAS 스토리지 객체 조회 및 파일 이동
      const nasObject = await this.fileNasStorageDomainService.조회(fileId);

      if (nasObject) {
        const trashPath = nasObject.objectKey;
        const trashFileName = this.extractFileNameFromPath(trashPath);
        const originalNasFileName = this.extractOriginalFileName(trashFileName);

        const folderPath = targetFolder.path.endsWith('/')
          ? targetFolder.path.slice(0, -1)
          : targetFolder.path;
        const restorePath = `${folderPath}/${originalNasFileName}`;

        try {
          await this.nasStorage.파일이동(trashPath, restorePath);
        } catch (nasError: any) {
          if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
            this.logger.debug(`파일 복원 이미 완료됨 (멱등성): ${trashPath} -> ${restorePath}`);
          } else {
            throw nasError;
          }
        }

        nasObject.updateObjectKey(restorePath);
        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileNasStorageDomainService.저장(nasObject);
      }

      // 5. 파일 상태 업데이트
      if (file.isTrashed()) {
        file.restore(restoreTargetFolderId);
        await this.fileDomainService.저장(file);
      }

      // 6. 휴지통 메타데이터 삭제
      await this.trashDomainService.삭제(trashMetadataId);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`파일 복원 완료: fileId=${fileId}, targetFolder=${restoreTargetFolderId}`);
    } catch (error) {
      this.logger.error(`파일 복원 실패: ${fileId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=restore | fileId=${fileId}`,
      );
      throw error;
    }
  }

  // ===== 헬퍼 메서드들 =====

  /**
   * 경로에서 파일명 추출
   */
  extractFileNameFromPath(filePath: string): string {
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      return filePath;
    }
    return filePath.substring(lastSlashIndex + 1);
  }

  /**
   * 휴지통 파일명에서 trashMetadataId 접두사 제거
   */
  extractOriginalFileName(trashFileName: string): string {
    const parts = trashFileName.split('__');
    if (parts.length < 2) {
      return trashFileName;
    }
    return parts.slice(1).join('__');
  }
}
