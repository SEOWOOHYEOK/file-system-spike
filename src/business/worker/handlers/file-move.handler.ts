/**
 * NAS 파일 이동 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { AvailabilityStatus } from '../../../domain/file';
import { FileDomainService } from '../../../domain/file/service/file-domain.service';
import { FileNasStorageDomainService } from '../../../domain/storage/file/service/file-nas-storage-domain.service';
import { FolderDomainService } from '../../../domain/folder/service/folder-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFileMoveJobData } from '../nas-file-sync.worker';

@Injectable()
export class FileMoveHandler {
  private readonly logger = new Logger(FileMoveHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly fileDomainService: FileDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFileMoveJobData>): Promise<void> {
    const { fileId, sourcePath, targetPath, originalFolderId, targetFolderId, syncEventId } = job.data;
    this.logger.debug(`파일 이동 처리 시작: ${fileId}, ${sourcePath} -> ${targetPath}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const nasObject = await this.fileNasStorageDomainService.조회(fileId);

      if (!nasObject) {
        this.logger.warn(`NAS 스토리지 객체를 찾을 수 없음: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable() && nasObject.objectKey === targetPath) {
        this.logger.debug(`이미 NAS에서 이동된 파일: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      const targetFolder = await this.folderDomainService.조회(targetFolderId);

      if (!targetFolder || !targetFolder.isActive()) {
        this.logger.warn(`대상 폴더가 삭제됨, 파일 이동 원복 처리: ${fileId}`);

        const file = await this.fileDomainService.조회(fileId);
        if (file) {
          file.moveTo(originalFolderId);
          await this.fileDomainService.저장(file);
        }

        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileNasStorageDomainService.저장(nasObject);

        await this.syncEventHelper.markDone(syncEvent);
        this.logger.warn(`대상 폴더 삭제로 파일 이동 원복 완료: ${fileId}`);
        return;
      }

      try {
        await this.nasStorage.파일이동(sourcePath, targetPath);
      } catch (nasError: any) {
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`파일 이동 이미 완료됨 (멱등성): ${sourcePath} -> ${targetPath}`);
        } else {
          throw nasError;
        }
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetPath);
      await this.fileNasStorageDomainService.저장(nasObject);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 파일 이동 완료: ${fileId}, ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      this.logger.error(`NAS 파일 이동 실패: ${fileId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=move | fileId=${fileId}`,
      );
      throw error;
    }
  }
}
