import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../domain/queue/ports/job-queue.port';
import {
  CACHE_STORAGE_PORT,
} from '../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
} from '../../domain/storage/ports/nas-storage.port';
import {
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
  StorageType,
  AvailabilityStatus
} from '../../domain/file';
import {
  FOLDER_REPOSITORY,
} from '../../domain/folder';
import {
  TRASH_REPOSITORY,
} from '../../domain/trash';
import {
  SYNC_EVENT_REPOSITORY,
  SyncEventStatus,
} from '../../domain/sync-event';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IFileRepository, IFileStorageObjectRepository } from '../../domain/file';
import type { IFolderRepository } from '../../domain/folder';
import type { ITrashRepository } from '../../domain/trash';
import type { ISyncEventRepository } from '../../domain/sync-event';

/**
 * 파일 복원 Job 데이터
 */
export interface FileRestoreJobData {
  syncEventId: string;
  trashMetadataId: string;
  fileId: string;
  targetFolderId: string;
  userId: string;
}

/**
 * 파일 영구삭제 Job 데이터
 */
export interface FilePurgeJobData {
  syncEventId: string;
  fileId: string;
  trashMetadataId: string;
  userId: string;
}

/**
 * 휴지통 복원/삭제 Worker
 * 휴지통에서 파일 복원 및 영구삭제 비동기 작업을 처리합니다.
 */
@Injectable()
export class TrashRestoreWorker implements OnModuleInit {
  private readonly logger = new Logger(TrashRestoreWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(TRASH_REPOSITORY)
    private readonly trashRepository: ITrashRepository,
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
  ) {}

  async onModuleInit() {
    this.logger.log('Registering trash restore/purge job processors...');

    // 파일 복원 처리
    await this.jobQueue.processJobs('file-restore', this.processRestoreJob.bind(this));

    // 파일 영구삭제 처리
    await this.jobQueue.processJobs('file-purge', this.processPurgeJob.bind(this));

    this.logger.log('All trash job processors registered');
  }

  /**
   * 파일 복원 작업 처리
   * 
   * 1. SyncEvent 상태를 PROCESSING으로 변경
   * 2. 대상 폴더 존재 여부 확인 (2차 방어)
   * 3. NAS에서 휴지통 → 원래 경로로 파일 이동
   * 4. DB 상태 업데이트 (file.state, file.folderId)
   * 5. TrashMetadata 삭제
   * 6. SyncEvent 상태를 DONE으로 변경
   */
  private async processRestoreJob(job: Job<FileRestoreJobData>): Promise<void> {
    const { syncEventId, trashMetadataId, fileId, targetFolderId, userId } = job.data;
    this.logger.debug(`Processing file restore: fileId=${fileId}, syncEventId=${syncEventId}`);

    try {
      // 1. SyncEvent 상태 업데이트
      await this.syncEventRepository.updateStatus(syncEventId, SyncEventStatus.PROCESSING);

      // 2. 휴지통 메타데이터 조회
      const trashMetadata = await this.trashRepository.findById(trashMetadataId);
      if (!trashMetadata) {
        this.logger.warn(`TrashMetadata not found: ${trashMetadataId}`);
        await this.syncEventRepository.updateStatus(
          syncEventId,
          SyncEventStatus.FAILED,
          'TRASH_METADATA_NOT_FOUND',
        );
        return;
      }

      // 3. 파일 조회
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        this.logger.warn(`File not found: ${fileId}`);
        await this.syncEventRepository.updateStatus(
          syncEventId,
          SyncEventStatus.FAILED,
          'FILE_NOT_FOUND',
        );
        return;
      }

      // 4. 대상 폴더 존재 여부 확인 (2차 방어)
      const targetFolder = await this.folderRepository.findById(targetFolderId);
      if (!targetFolder || !targetFolder.isActive()) {
        this.logger.warn(`Target folder not found or deleted: ${targetFolderId}`);
        await this.syncEventRepository.updateStatus(
          syncEventId,
          SyncEventStatus.FAILED,
          'TARGET_FOLDER_NOT_FOUND',
        );
        return;
      }

      // 5. NAS 스토리지 객체 조회
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (nasObject) {
        // 6. NAS에서 휴지통 → 원래 경로로 파일 이동
        const trashPath = nasObject.objectKey; // 현재 휴지통 경로 (예: ".trash/1769424469467_333.txt")
        
        // NAS 파일명 추출 (타임스탬프 프리픽스 포함)
        // 예: ".trash/1769424469467_333.txt" → "1769424469467_333.txt"
        const nasFileName = this.extractFileNameFromPath(trashPath);
        
        // 복원 경로 생성 (폴더 경로 + NAS 파일명)
        const folderPath = targetFolder.path.endsWith('/') 
          ? targetFolder.path.slice(0, -1) 
          : targetFolder.path;
        const restorePath = `${folderPath}/${nasFileName}`;

        try {
          await this.nasStorage.파일이동(trashPath, restorePath);

          // NAS 객체 업데이트
          nasObject.updateObjectKey(restorePath);
          nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
          await this.fileStorageObjectRepository.save(nasObject);
        } catch (nasError) {
          this.logger.error(`NAS restore failed: ${fileId}`, nasError);
          throw nasError;
        }
      }

      // 7. 파일 상태 업데이트
      file.restore(targetFolderId);
      await this.fileRepository.save(file);

      // 8. 휴지통 메타데이터 삭제
      await this.trashRepository.delete(trashMetadataId);

      // 9. SyncEvent 완료
      await this.syncEventRepository.updateStatus(syncEventId, SyncEventStatus.DONE);

      this.logger.log(`Successfully restored file: fileId=${fileId}, targetFolder=${targetFolderId}`);
    } catch (error) {
      this.logger.error(`Failed to restore file: ${fileId}`, error);

      // 에러 상태 업데이트 (재시도 가능한 에러인 경우 throw)
      const syncEvent = await this.syncEventRepository.findById(syncEventId);
      if (syncEvent && syncEvent.retryCount < syncEvent.maxRetries) {
        // 재시도 가능
        throw error;
      }

      // 최대 재시도 초과 시 FAILED로 마킹
      await this.syncEventRepository.updateStatus(
        syncEventId,
        SyncEventStatus.FAILED,
        error.message,
      );
    }
  }

  /**
   * 파일 영구삭제 작업 처리
   * 
   * 1. SyncEvent 상태를 PROCESSING으로 변경
   * 2. SeaweedFS(캐시)에서 파일 삭제
   * 3. NAS에서 파일 삭제
   * 4. DB에서 file_storage_objects 삭제
   * 5. SyncEvent 상태를 DONE으로 변경
   */
  private async processPurgeJob(job: Job<FilePurgeJobData>): Promise<void> {
    const { syncEventId, fileId, trashMetadataId, userId } = job.data;
    this.logger.debug(`Processing file purge: fileId=${fileId}, syncEventId=${syncEventId}`);

    try {
      // 1. SyncEvent 상태 업데이트
      await this.syncEventRepository.updateStatus(syncEventId, SyncEventStatus.PROCESSING);

      // 2. 파일 조회
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        this.logger.warn(`File not found for purge: ${fileId}`);
        await this.syncEventRepository.updateStatus(syncEventId, SyncEventStatus.DONE);
        return;
      }

      // 3. SeaweedFS(캐시)에서 파일 삭제
      const cacheObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.CACHE,
      );

      if (cacheObject) {
        try {
          await this.cacheStorage.파일삭제(cacheObject.objectKey);
          await this.fileStorageObjectRepository.delete(cacheObject.id);
          this.logger.debug(`Deleted cache object: ${cacheObject.objectKey}`);
        } catch (cacheError) {
          // 캐시 삭제 실패는 경고만 (NAS 삭제 계속 진행)
          this.logger.warn(`Cache delete failed (continuing): ${fileId}`, cacheError);
        }
      }

      // 4. NAS에서 파일 삭제
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (nasObject) {
        try {
          await this.nasStorage.파일삭제(nasObject.objectKey);
          await this.fileStorageObjectRepository.delete(nasObject.id);
          this.logger.debug(`Deleted NAS object: ${nasObject.objectKey}`);
        } catch (nasError) {
          this.logger.error(`NAS delete failed: ${fileId}`, nasError);
          await this.syncEventRepository.updateStatus(
            syncEventId,
            SyncEventStatus.FAILED,
            `NAS_DELETE_ERROR: ${nasError.message}`,
          );
          throw nasError;
        }
      }

      // 5. SyncEvent 완료
      await this.syncEventRepository.updateStatus(syncEventId, SyncEventStatus.DONE);

      this.logger.log(`Successfully purged file: fileId=${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to purge file: ${fileId}`, error);

      // 에러 상태 업데이트
      const syncEvent = await this.syncEventRepository.findById(syncEventId);
      if (syncEvent && syncEvent.retryCount < syncEvent.maxRetries) {
        throw error;
      }

      await this.syncEventRepository.updateStatus(
        syncEventId,
        SyncEventStatus.FAILED,
        error.message,
      );
    }
  }

  /**
   * 경로에서 파일명 추출
   * 예: ".trash/1769424469467_333.txt" → "1769424469467_333.txt"
   * 예: "/folder/subfolder/file.txt" → "file.txt"
   */
  private extractFileNameFromPath(filePath: string): string {
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      return filePath;
    }
    return filePath.substring(lastSlashIndex + 1);
  }
}
