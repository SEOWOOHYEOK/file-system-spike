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
  FolderAvailabilityStatus,
} from '../../domain/folder';

import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import { SyncEventEntity } from '../../domain/sync-event/entities/sync-event.entity';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IFolderRepository } from '../../domain/folder';

import type { ISyncEventRepository } from '../../domain/sync-event/repositories/sync-event.repository.interface';

import {
  type IFolderStorageObjectRepository,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';
import {
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';

/**
 * NAS 폴더 동기화 Job 데이터 타입들
 * syncEventId: SyncEvent 상태 추적용 (선택적, 하위 호환성)
 */
export interface NasSyncMkdirJobData {
  folderId: string;
  path: string;
  syncEventId?: string;
}

export interface NasSyncRenameDirJobData {
  folderId: string;
  oldPath: string;
  newPath: string;
  syncEventId?: string;
}

export interface NasSyncMoveDirJobData {
  folderId: string;
  oldPath: string;
  newPath: string;
  originalParentId: string | null;
  targetParentId: string;
  syncEventId?: string;
}

export interface NasFolderToTrashJobData {
  folderId: string;
  currentPath: string;
  trashPath: string;
  syncEventId?: string;
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
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
  ) { }

  /**
   * SyncEvent 조회 (없으면 null)
   */
  private async getSyncEvent(syncEventId?: string): Promise<SyncEventEntity | null> {
    if (!syncEventId) return null;
    return this.syncEventRepository.findById(syncEventId);
  }

  /**
   * SyncEvent 처리 시작 (PROCESSING)
   */
  private async markSyncEventProcessing(syncEvent: SyncEventEntity | null): Promise<void> {
    if (!syncEvent) return;
    syncEvent.startProcessing();
    await this.syncEventRepository.save(syncEvent);
  }

  /**
   * SyncEvent 성공 완료 (DONE)
   */
  private async markSyncEventDone(syncEvent: SyncEventEntity | null): Promise<void> {
    if (!syncEvent) return;
    syncEvent.complete();
    await this.syncEventRepository.save(syncEvent);
  }

  /**
   * SyncEvent 실패 처리 (retry 또는 FAILED)
   */
  private async handleSyncEventFailure(
    syncEvent: SyncEventEntity | null,
    error: Error,
  ): Promise<void> {
    if (!syncEvent) return;
    syncEvent.retry(error.message);
    await this.syncEventRepository.save(syncEvent);
  }

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
    const { folderId, path, syncEventId } = job.data;
    this.logger.debug(`Processing NAS mkdir for folder: ${folderId}, path: ${path}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable()) {
        this.logger.debug(`Folder already created in NAS: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. NAS에 폴더 생성
      await this.nasStorage.폴더생성(path);

      // 3. 상태 업데이트
      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(path);
      await this.folderStorageObjectRepository.save(storageObject);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully created folder in NAS: ${folderId} -> ${path}`);
    } catch (error) {
      this.logger.error(`Failed to create folder in NAS: ${folderId}`, error);
      await this.handleSyncEventFailure(syncEvent, error as Error);
      throw error;
    }
  }

  /**
   * NAS 폴더 이름 변경 작업 처리
   */
  private async processRenameDirJob(job: Job<NasSyncRenameDirJobData>): Promise<void> {
    const { folderId, oldPath, newPath, syncEventId } = job.data;
    this.logger.debug(`Processing NAS rename for folder: ${folderId}, ${oldPath} -> ${newPath}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable() && storageObject.objectKey === newPath) {
        this.logger.debug(`Folder already renamed in NAS: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
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

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully renamed folder in NAS: ${folderId}, ${oldPath} -> ${newPath}`);
    } catch (error) {
      this.logger.error(`Failed to rename folder in NAS: ${folderId}`, error);
      await this.handleSyncEventFailure(syncEvent, error as Error);
      throw error;
    }
  }

  /**
   * NAS 폴더 이동 작업 처리
   * 
   * 2차 방어: 대상 폴더가 삭제된 경우 원복 처리
   */
  private async processMoveDirJob(job: Job<NasSyncMoveDirJobData>): Promise<void> {
    const { folderId, oldPath, newPath, originalParentId, targetParentId, syncEventId } = job.data;
    this.logger.debug(`Processing NAS move for folder: ${folderId}, ${oldPath} -> ${newPath}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable() && storageObject.objectKey === newPath) {
        this.logger.debug(`Folder already moved in NAS: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. 2차 방어: 대상 부모 폴더 존재 여부 확인=======TODO
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

        // SyncEvent 완료 (원복도 성공적인 처리)
        await this.markSyncEventDone(syncEvent);

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

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully moved folder in NAS: ${folderId}, ${oldPath} -> ${newPath}`);
    } catch (error) {
      this.logger.error(`Failed to move folder in NAS: ${folderId}`, error);
      await this.handleSyncEventFailure(syncEvent, error as Error);
      throw error;
    }
  }

  /**
   * NAS 폴더 휴지통 이동 작업 처리
   */
  private async processTrashJob(job: Job<NasFolderToTrashJobData>): Promise<void> {
    const { folderId, currentPath, trashPath, syncEventId } = job.data;
    this.logger.debug(`Processing NAS trash move for folder: ${folderId}, ${currentPath} -> ${trashPath}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      if (!storageObject) {
        this.logger.warn(`Folder storage object not found for folder: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 이미 완료된 경우 스킵
      if (storageObject.isAvailable() && storageObject.objectKey === trashPath) {
        this.logger.debug(`Folder already moved to trash in NAS: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. NAS에서 휴지통으로 이동
      await this.nasStorage.폴더이동(currentPath, trashPath);

      // 3. 상태 업데이트
      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(trashPath);
      await this.folderStorageObjectRepository.save(storageObject);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully moved folder to trash in NAS: ${folderId}, ${currentPath} -> ${trashPath}`);
    } catch (error) {
      this.logger.error(`Failed to move folder to trash in NAS: ${folderId}`, error);
      await this.handleSyncEventFailure(syncEvent, error as Error);
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
