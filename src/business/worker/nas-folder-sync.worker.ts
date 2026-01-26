import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../domain/queue/ports/job-queue.port';
import {
  NAS_STORAGE_PORT,
} from '../../domain/storage/ports/nas-storage.port';
import {
  FOLDER_REPOSITORY,
  FOLDER_STORAGE_OBJECT_REPOSITORY,
  FolderAvailabilityStatus,
} from '../../domain/folder';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IFolderRepository, IFolderStorageObjectRepository } from '../../domain/folder';

/**
 * NAS 폴더 동기화 Job 데이터 타입들
 */
export interface NasSyncMkdirJobData {
  folderId: string;
  path: string;
}

export interface NasSyncRenameDirJobData {
  folderId: string;
  oldPath: string;
  newPath: string;
}

export interface NasSyncMoveDirJobData {
  folderId: string;
  oldPath: string;
  newPath: string;
  originalParentId: string | null;
  targetParentId: string;
}

export interface NasFolderToTrashJobData {
  folderId: string;
  currentPath: string;
  trashPath: string;
}

@Injectable()
export class NasFolderSyncWorker implements OnModuleInit {
  private readonly logger = new Logger(NasFolderSyncWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(FOLDER_STORAGE_OBJECT_REPOSITORY)
    private readonly folderStorageObjectRepository: IFolderStorageObjectRepository,
  ) {}

  async onModuleInit() {
    this.logger.log('Registering NAS folder sync job processors...');

    // 폴더 생성 동기화
    await this.jobQueue.processJobs('NAS_SYNC_MKDIR', this.processMkdirJob.bind(this));

    // 폴더 이름 변경 동기화
    await this.jobQueue.processJobs('NAS_SYNC_RENAME_DIR', this.processRenameDirJob.bind(this));

    // 폴더 이동 동기화
    await this.jobQueue.processJobs('NAS_SYNC_MOVE_DIR', this.processMoveDirJob.bind(this));

    // 폴더 휴지통 이동
    await this.jobQueue.processJobs('NAS_FOLDER_TO_TRASH', this.processTrashJob.bind(this));

    this.logger.log('All NAS folder sync job processors registered');
  }

  /**
   * NAS 폴더 생성 작업 처리
   */
  private async processMkdirJob(job: Job<NasSyncMkdirJobData>): Promise<void> {
    const { folderId, path } = job.data;
    this.logger.debug(`Processing NAS mkdir for folder: ${folderId}, path: ${path}`);

    try {
      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable()) {
        this.logger.debug(`Folder already created in NAS: ${folderId}`);
        return;
      }

      // 2. NAS에 폴더 생성
      await this.nasStorage.폴더생성(path);

      // 3. 상태 업데이트
      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(path);
      await this.folderStorageObjectRepository.save(storageObject);

      this.logger.log(`Successfully created folder in NAS: ${folderId} -> ${path}`);
    } catch (error) {
      this.logger.error(`Failed to create folder in NAS: ${folderId}`, error);
      throw error;
    }
  }

  /**
   * NAS 폴더 이름 변경 작업 처리
   */
  private async processRenameDirJob(job: Job<NasSyncRenameDirJobData>): Promise<void> {
    const { folderId, oldPath, newPath } = job.data;
    this.logger.debug(`Processing NAS rename for folder: ${folderId}, ${oldPath} -> ${newPath}`);

    try {
      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable() && storageObject.objectKey === newPath) {
        this.logger.debug(`Folder already renamed in NAS: ${folderId}`);
        return;
      }

      // 2. NAS에서 폴더 이름 변경 (이동과 동일)
      await this.nasStorage.폴더이동(oldPath, newPath);

      // 3. 상태 업데이트
      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(newPath);
      await this.folderStorageObjectRepository.save(storageObject);

      // 4. 하위 폴더들의 objectKey도 업데이트
      await this.updateDescendantStorageKeys(oldPath, newPath);

      this.logger.log(`Successfully renamed folder in NAS: ${folderId}, ${oldPath} -> ${newPath}`);
    } catch (error) {
      this.logger.error(`Failed to rename folder in NAS: ${folderId}`, error);
      throw error;
    }
  }

  /**
   * NAS 폴더 이동 작업 처리
   * 
   * 2차 방어: 대상 폴더가 삭제된 경우 원복 처리
   */
  private async processMoveDirJob(job: Job<NasSyncMoveDirJobData>): Promise<void> {
    const { folderId, oldPath, newPath, originalParentId, targetParentId } = job.data;
    this.logger.debug(`Processing NAS move for folder: ${folderId}, ${oldPath} -> ${newPath}`);

    try {
      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable() && storageObject.objectKey === newPath) {
        this.logger.debug(`Folder already moved in NAS: ${folderId}`);
        return;
      }

      // 2. 2차 방어: 대상 부모 폴더 존재 여부 확인
      const targetParent = await this.folderRepository.findById(targetParentId);

      if (!targetParent || !targetParent.isActive()) {
        // 대상 폴더가 삭제됨 - 원복 처리
        this.logger.warn(`Target parent folder deleted, reverting folder move: ${folderId}`);

        // 폴더의 parentId를 원래 폴더로 원복
        const folder = await this.folderRepository.findById(folderId);
        if (folder && originalParentId) {
          const originalParent = await this.folderRepository.findById(originalParentId);
          if (originalParent) {
            folder.moveTo(originalParentId, `${originalParent.path}/${folder.name}`);
            await this.folderRepository.save(folder);
          }
        }

        // NAS 상태를 AVAILABLE로 변경 (이동하지 않음)
        storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
        await this.folderStorageObjectRepository.save(storageObject);

        this.logger.warn(`Folder move reverted due to deleted target parent folder: ${folderId}`);
        return;
      }

      // 3. NAS에서 폴더 이동
      await this.nasStorage.폴더이동(oldPath, newPath);

      // 4. 상태 업데이트
      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(newPath);
      await this.folderStorageObjectRepository.save(storageObject);

      // 5. 하위 폴더들의 objectKey도 업데이트
      await this.updateDescendantStorageKeys(oldPath, newPath);

      this.logger.log(`Successfully moved folder in NAS: ${folderId}, ${oldPath} -> ${newPath}`);
    } catch (error) {
      this.logger.error(`Failed to move folder in NAS: ${folderId}`, error);
      throw error;
    }
  }

  /**
   * NAS 폴더 휴지통 이동 작업 처리
   */
  private async processTrashJob(job: Job<NasFolderToTrashJobData>): Promise<void> {
    const { folderId, currentPath, trashPath } = job.data;
    this.logger.debug(`Processing NAS trash move for folder: ${folderId}, ${currentPath} -> ${trashPath}`);

    try {
      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable() && storageObject.objectKey === trashPath) {
        this.logger.debug(`Folder already moved to trash in NAS: ${folderId}`);
        return;
      }

      // 2. NAS에서 휴지통으로 이동
      await this.nasStorage.폴더이동(currentPath, trashPath);

      // 3. 상태 업데이트
      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(trashPath);
      await this.folderStorageObjectRepository.save(storageObject);

      this.logger.log(`Successfully moved folder to trash in NAS: ${folderId}, ${currentPath} -> ${trashPath}`);
    } catch (error) {
      this.logger.error(`Failed to move folder to trash in NAS: ${folderId}`, error);
      throw error;
    }
  }

  /**
   * 하위 폴더들의 storage objectKey 업데이트
   */
  private async updateDescendantStorageKeys(oldPathPrefix: string, newPathPrefix: string): Promise<void> {
    try {
      // 하위 폴더 스토리지 객체들 조회 및 업데이트
      const descendants = await this.folderStorageObjectRepository.findByObjectKeyPrefix(oldPathPrefix + '/');
      
      for (const descendant of descendants) {
        const newObjectKey = descendant.objectKey.replace(oldPathPrefix, newPathPrefix);
        descendant.updateObjectKey(newObjectKey);
        await this.folderStorageObjectRepository.save(descendant);
      }

      this.logger.debug(`Updated ${descendants.length} descendant folder storage keys`);
    } catch (error) {
      this.logger.warn(`Failed to update descendant storage keys: ${error}`);
      // 하위 폴더 업데이트 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }
}
