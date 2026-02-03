import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { buildPath } from '../../common/utils';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../domain/queue/ports/job-queue.port';
import {
  DISTRIBUTED_LOCK_PORT,
} from '../../domain/queue/ports/distributed-lock.port';
import {
  NAS_STORAGE_PORT,
} from '../../domain/storage/ports/nas-storage.port';
import {
  FOLDER_REPOSITORY,
  FolderAvailabilityStatus,
} from '../../domain/folder';

import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import { SyncEventEntity } from '../../domain/sync-event/entities/sync-event.entity';
import { TRASH_REPOSITORY } from '../../domain/trash/repositories/trash.repository.interface';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { IDistributedLockPort } from '../../domain/queue/ports/distributed-lock.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IFolderRepository } from '../../domain/folder';

import type { ISyncEventRepository } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import type { ITrashRepository } from '../../domain/trash/repositories/trash.repository.interface';

import {
  type IFolderStorageObjectRepository,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';
import {
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';

/**
 * NAS 폴더 동기화 Action 타입
 */
export type NasFolderAction = 'mkdir' | 'rename' | 'move' | 'trash' | 'restore' | 'purge';

/**
 * NAS 폴더 동기화 통합 Job 데이터 타입
 * 
 * 폴더 기반 큐 구조: NAS_FOLDER_SYNC:{folderId}
 * - 같은 폴더에 대한 작업은 순차 처리 보장
 * - 다른 폴더에 대한 작업은 병렬 처리 가능
 */
export interface NasFolderSyncJobData {
  /** 폴더 ID */
  folderId: string;
  /** 동기화 액션 타입 */
  action: NasFolderAction;
  /** SyncEvent 상태 추적용 (선택적) */
  syncEventId?: string;

  // === Action별 추가 데이터 ===

  // mkdir 액션용
  /** 생성할 폴더 경로 (mkdir) */
  path?: string;

  // rename/move 액션용
  /** 기존 경로 (rename, move) */
  oldPath?: string;
  /** 새 경로 (rename, move) */
  newPath?: string;

  // move 액션용
  /** 원본 부모 폴더 ID (move - 롤백용) */
  originalParentId?: string | null;
  /** 타겟 부모 폴더 ID (move) */
  targetParentId?: string;

  // trash 액션용
  /** 현재 폴더 경로 (trash) */
  currentPath?: string;
  /** 휴지통 경로 (trash, restore, purge) */
  trashPath?: string;

  // restore 액션용
  /** 복구 대상 경로 (restore) */
  restorePath?: string;
  /** 휴지통 메타데이터 ID (restore, purge) */
  trashMetadataId?: string;
}

/**
 * NAS 폴더 동기화 큐 설정
 */
export const NAS_FOLDER_SYNC_QUEUE_PREFIX = 'NAS_FOLDER_SYNC';

/**
 * 동시 처리 수 (concurrency)
 * - 다른 폴더는 병렬 처리
 * - 같은 폴더는 폴더별 락으로 순차 처리 보장
 * - 환경에 따라 조정 가능 (기본값: 5)
 */
export const NAS_FOLDER_SYNC_CONCURRENCY = 5;

/**
 * NAS 폴더 동기화 재시도 설정
 * - 최대 재시도 횟수: 3회
 * - 재시도 간격: 3초 (고정)
 */
export const NAS_FOLDER_SYNC_MAX_ATTEMPTS = 3;
export const NAS_FOLDER_SYNC_BACKOFF_MS = 3000;

export function getNasFolderSyncQueueName(folderId: string): string {
  return `${NAS_FOLDER_SYNC_QUEUE_PREFIX}:${folderId}`;
}

@Injectable()
export class NasFolderSyncWorker implements OnModuleInit {
  private readonly logger = new Logger(NasFolderSyncWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(DISTRIBUTED_LOCK_PORT)
    private readonly distributedLock: IDistributedLockPort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(FOLDER_STORAGE_OBJECT_REPOSITORY)
    private readonly folderStorageObjectRepository: IFolderStorageObjectRepository,
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
    @Inject(TRASH_REPOSITORY)
    private readonly trashRepository: ITrashRepository,
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
   * SyncEvent 최종 실패 처리 (FAILED 상태로 마킹 + 알림 로그)
   * - 큐에서 최대 재시도 횟수를 모두 소진한 후 호출됨
   */
  private async handleSyncEventFailure(
    syncEvent: SyncEventEntity | null,
    error: Error,
    jobData: NasFolderSyncJobData,
  ): Promise<void> {
    if (!syncEvent) return;
    syncEvent.fail(error.message);
    await this.syncEventRepository.save(syncEvent);
    this.logSyncFailureAlert(syncEvent, error, jobData);
  }

  /**
   * 동기화 최종 실패 알림 로그
   * - 3회 재시도 후 최종 실패 시 관리자 알림용 로그 출력
   */
  private logSyncFailureAlert(
    syncEvent: SyncEventEntity,
    error: Error,
    jobData: NasFolderSyncJobData,
  ): void {
    this.logger.error(
      `[SYNC_FAILURE_ALERT] ` +
      `action=${jobData.action} | folderId=${jobData.folderId} | ` +
      `syncEventId=${syncEvent.id} | error=${error.message}`,
    );
    // TODO: 추후 알림 시스템 연동 시 확장 가능 (Slack, Email 등)
  }

  async onModuleInit() {
    this.logger.log('Registering NAS folder sync job processors...');

    // 통합 큐: NAS_FOLDER_SYNC (폴더별 락으로 순차 처리 보장)
    // concurrency: 다른 폴더는 병렬 처리, 같은 폴더는 락으로 순차 처리
    const concurrency = NAS_FOLDER_SYNC_CONCURRENCY;
    await this.jobQueue.processJobs(
      NAS_FOLDER_SYNC_QUEUE_PREFIX,
      this.processFolderSyncJob.bind(this),
      { concurrency },
    );
    this.logger.log(`NAS_FOLDER_SYNC queue registered with concurrency: ${concurrency}`);
  }

  /**
   * 통합 폴더 동기화 작업 처리
   * 
   * 폴더별 락을 사용하여 같은 폴더에 대한 작업은 순차 처리됩니다.
   * 다른 폴더에 대한 작업은 병렬로 처리됩니다.
   */
  private async processFolderSyncJob(job: Job<NasFolderSyncJobData>): Promise<void> {
    const { folderId, action } = job.data;
    const lockKey = `folder-sync:${folderId}`;
    const jobStartTime = Date.now();
    const shortFolderId = folderId.substring(0, 8);

    // 🔵 작업 시작 로그 (병렬 처리 확인용)
    this.logger.log(
      `[PARALLEL] 📥 JOB_START | folder=${shortFolderId}... | action=${action} | jobId=${job.id}`,
    );

    // 🟡 락 획득 시도 로그
    this.logger.log(
      `[PARALLEL] 🔐 LOCK_WAIT | folder=${shortFolderId}... | action=${action} | lockKey=${lockKey}`,
    );

    const lockWaitStart = Date.now();

    // 폴더별 락 획득 후 작업 실행 (같은 폴더는 순차 처리)
    await this.distributedLock.withLock(
      lockKey,
      async () => {
        const lockWaitTime = Date.now() - lockWaitStart;

        // 🟢 락 획득 성공 로그
        this.logger.log(
          `[PARALLEL] 🔓 LOCK_ACQUIRED | folder=${shortFolderId}... | action=${action} | waitTime=${lockWaitTime}ms`,
        );

        const actionStartTime = Date.now();

        switch (action) {
          case 'mkdir':
            await this.handleMkdir(job);
            break;
          case 'rename':
            await this.handleRename(job);
            break;
          case 'move':
            await this.handleMove(job);
            break;
          case 'trash':
            await this.handleTrash(job);
            break;
          case 'restore':
            await this.handleRestore(job);
            break;
          case 'purge':
            await this.handlePurge(job);
            break;
          default:
            this.logger.warn(`Unknown action: ${action}`);
        }

        const actionDuration = Date.now() - actionStartTime;
        const totalDuration = Date.now() - jobStartTime;

        // ✅ 작업 완료 로그
        this.logger.log(
          `[PARALLEL] ✅ JOB_DONE | folder=${shortFolderId}... | action=${action} | ` +
          `actionTime=${actionDuration}ms | totalTime=${totalDuration}ms | lockWait=${lockWaitTime}ms`,
        );
      },
      { ttl: 60000, waitTimeout: 30000 }, // 60초 TTL, 30초 대기
    );
  }

  // ===== 통합 Job용 핸들러 메서드들 =====

  /**
   * Mkdir 액션 처리
   */
  private async handleMkdir(job: Job<NasFolderSyncJobData>): Promise<void> {
    const { folderId, path, syncEventId } = job.data;
    this.logger.debug(`Handling mkdir for folder: ${folderId}, path: ${path}`);

    if (!path) {
      this.logger.error(`Missing path for mkdir: ${folderId}`);
      return;
    }

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
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_FOLDER_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Rename 액션 처리
   */
  private async handleRename(job: Job<NasFolderSyncJobData>): Promise<void> {
    const { folderId, oldPath, newPath, syncEventId } = job.data;
    this.logger.debug(`Handling rename for folder: ${folderId}, ${oldPath} -> ${newPath}`);

    if (!oldPath || !newPath) {
      this.logger.error(`Missing oldPath or newPath for rename: ${folderId}`);
      return;
    }

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
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_FOLDER_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Move 액션 처리
   * 
   * 2차 방어: 대상 폴더가 삭제된 경우 원복 처리
   */
  private async handleMove(job: Job<NasFolderSyncJobData>): Promise<void> {
    const { folderId, oldPath, newPath, originalParentId, targetParentId, syncEventId } = job.data;
    this.logger.debug(`Handling move for folder: ${folderId}, ${oldPath} -> ${newPath}`);

    if (!oldPath || !newPath || !targetParentId) {
      this.logger.error(`Missing required fields for move: ${folderId}`);
      return;
    }

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
            const revertPath = buildPath(originalParent.path, folder.name);
            folder.moveTo(originalParentId, revertPath);
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
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_FOLDER_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Trash 액션 처리
   */
  private async handleTrash(job: Job<NasFolderSyncJobData>): Promise<void> {
    const { folderId, currentPath, trashPath, syncEventId } = job.data;
    this.logger.debug(`Handling trash for folder: ${folderId}, ${currentPath} -> ${trashPath}`);

    if (!currentPath || !trashPath) {
      this.logger.error(`Missing currentPath or trashPath for trash: ${folderId}`);
      return;
    }

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
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_FOLDER_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Restore 액션 처리
   * 휴지통에서 원래 경로로 폴더 복구
   */
  private async handleRestore(job: Job<NasFolderSyncJobData>): Promise<void> {
    const { folderId, trashPath, restorePath, trashMetadataId, originalParentId, syncEventId } = job.data;
    this.logger.debug(`Handling restore for folder: ${folderId}, ${trashPath} -> ${restorePath}`);

    if (!trashPath || !restorePath || !trashMetadataId) {
      this.logger.error(`Missing required fields for restore: ${folderId}`);
      return;
    }

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
      if (storageObject.isAvailable() && storageObject.objectKey === restorePath) {
        this.logger.debug(`Folder already restored in NAS: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. 폴더 조회
      const folder = await this.folderRepository.findById(folderId);
      if (!folder) {
        this.logger.warn(`Folder not found for restore: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 3. NAS에서 휴지통에서 원래 경로로 이동
      await this.nasStorage.폴더이동(trashPath, restorePath);

      // 4. 폴더 상태 복구 (TRASHED → ACTIVE)
      folder.restore();
      folder.moveTo(originalParentId || folder.parentId!, restorePath);
      await this.folderRepository.save(folder);

      // 5. 스토리지 상태 업데이트
      storageObject.updateStatus(FolderAvailabilityStatus.AVAILABLE);
      storageObject.updateObjectKey(restorePath);
      await this.folderStorageObjectRepository.save(storageObject);

      // 6. trash_metadata 삭제
      await this.trashRepository.delete(trashMetadataId);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully restored folder from trash in NAS: ${folderId}, ${trashPath} -> ${restorePath}`);
    } catch (error) {
      this.logger.error(`Failed to restore folder from trash in NAS: ${folderId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_FOLDER_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Purge 액션 처리
   * 휴지통에서 폴더를 영구 삭제
   */
  private async handlePurge(job: Job<NasFolderSyncJobData>): Promise<void> {
    const { folderId, trashPath, trashMetadataId, syncEventId } = job.data;
    this.logger.debug(`Handling purge for folder: ${folderId}, trashPath: ${trashPath}`);

    if (!trashPath || !trashMetadataId) {
      this.logger.error(`Missing required fields for purge: ${folderId}`);
      return;
    }

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. 폴더 조회
      const folder = await this.folderRepository.findById(folderId);
      if (!folder) {
        this.logger.warn(`Folder not found for purge: ${folderId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. 폴더 스토리지 객체 조회
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

      // 3. NAS에서 폴더 삭제
      try {
        await this.nasStorage.폴더삭제(trashPath);
        this.logger.debug(`Folder deleted from NAS: ${trashPath}`);
      } catch (deleteError) {
        // 이미 삭제된 경우 무시
        this.logger.warn(`Folder may already be deleted from NAS: ${trashPath}`, deleteError);
      }

      // 4. 스토리지 객체 삭제
      if (storageObject) {
        await this.folderStorageObjectRepository.delete(storageObject.id);
      }

      // 5. 폴더 상태를 DELETED로 변경 (NAS 작업 완료 후)
      folder.permanentDelete();
      await this.folderRepository.save(folder);

      // 6. trash_metadata 삭제
      await this.trashRepository.delete(trashMetadataId);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully purged folder from NAS: ${folderId}, trashPath: ${trashPath}`);
    } catch (error) {
      this.logger.error(`Failed to purge folder from NAS: ${folderId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_FOLDER_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
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
