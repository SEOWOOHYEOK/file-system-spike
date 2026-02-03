import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../domain/queue/ports/job-queue.port';
import {
  DISTRIBUTED_LOCK_PORT,
} from '../../domain/queue/ports/distributed-lock.port';
import {
  CACHE_STORAGE_PORT,
} from '../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
} from '../../domain/storage/ports/nas-storage.port';
import {
  FILE_REPOSITORY,
  StorageType,
  AvailabilityStatus,
} from '../../domain/file';
import { FILE_STORAGE_OBJECT_REPOSITORY } from '../../domain/storage';
import { FOLDER_REPOSITORY } from '../../domain/folder';
import { TRASH_REPOSITORY } from '../../domain/trash';
import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import { SyncEventEntity } from '../../domain/sync-event/entities/sync-event.entity';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { IDistributedLockPort } from '../../domain/queue/ports/distributed-lock.port';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IFileRepository } from '../../domain/file';
import type { IFileStorageObjectRepository } from '../../domain/storage';
import type { IFolderRepository } from '../../domain/folder';
import type { ITrashRepository } from '../../domain/trash';
import type { ISyncEventRepository } from '../../domain/sync-event/repositories/sync-event.repository.interface';



/**
 * NAS 파일 동기화 Action 타입
 */
export type NasFileAction = 'upload' | 'rename' | 'move' | 'trash' | 'restore' | 'purge';

/**
 * NAS 파일 동기화 통합 Job 데이터 타입
 * 
 * 파일 기반 큐 구조: NAS_FILE_SYNC:{fileId}
 * - 같은 파일에 대한 작업은 순차 처리 보장
 * - 다른 파일에 대한 작업은 병렬 처리 가능
 */
export interface NasFileSyncJobData {
  /** 파일 ID */
  fileId: string;
  /** 동기화 액션 타입 */
  action: NasFileAction;
  /** SyncEvent 상태 추적용 (선택적) */
  syncEventId?: string;

  // === Action별 추가 데이터 ===
  
  // rename 액션용
  /** 기존 객체 키 (rename, trash) */
  oldObjectKey?: string;
  /** 새 객체 키 (rename) */
  newObjectKey?: string;

  // move 액션용
  /** 소스 경로 (move) */
  sourcePath?: string;
  /** 타겟 경로 (move) */
  targetPath?: string;
  /** 원본 폴더 ID (move - 롤백용) */
  originalFolderId?: string;
  /** 타겟 폴더 ID (move) */
  targetFolderId?: string;

  // trash 액션용
  /** 현재 객체 키 (trash) */
  currentObjectKey?: string;
  /** 휴지통 경로 (trash) */
  trashPath?: string;

  // restore 액션용
  /** 휴지통 메타데이터 ID (restore, purge) */
  trashMetadataId?: string;
  /** 복원 대상 폴더 ID (restore) */
  restoreTargetFolderId?: string;

  // restore/purge 공통
  /** 작업 수행 사용자 ID */
  userId?: string;
}

/**
 * NAS 파일 동기화 큐 설정
 */
export const NAS_FILE_SYNC_QUEUE_PREFIX = 'NAS_FILE_SYNC';

/**
 * 동시 처리 수 (concurrency)
 * - 다른 파일은 병렬 처리
 * - 같은 파일은 파일별 락으로 순차 처리 보장
 * - 환경에 따라 조정 가능 (기본값: 5)
 */
export const NAS_FILE_SYNC_CONCURRENCY = 5;

/**
 * NAS 동기화 재시도 설정
 * - 최대 재시도 횟수: 3회
 * - 재시도 간격: 3초 (고정)
 */
export const NAS_SYNC_MAX_ATTEMPTS = 3;
export const NAS_SYNC_BACKOFF_MS = 3000;

export function getNasFileSyncQueueName(fileId: string): string {
  return `${NAS_FILE_SYNC_QUEUE_PREFIX}:${fileId}`;
}

@Injectable()
export class NasSyncWorker implements OnModuleInit {
  private readonly logger = new Logger(NasSyncWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(DISTRIBUTED_LOCK_PORT)
    private readonly distributedLock: IDistributedLockPort,
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
    jobData: NasFileSyncJobData,
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
    jobData: NasFileSyncJobData,
  ): void {
    this.logger.error(
      `[SYNC_FAILURE_ALERT] ` +
      `action=${jobData.action} | fileId=${jobData.fileId} | ` +
      `syncEventId=${syncEvent.id} | error=${error.message}`,
    );
    // TODO: 추후 알림 시스템 연동 시 확장 가능 (Slack, Email 등)
  }

  async onModuleInit() {
    this.logger.log('Registering NAS sync job processors...');

    // 새 통합 큐: NAS_FILE_SYNC (파일별 락으로 순차 처리 보장)
    // concurrency: 다른 파일은 병렬 처리, 같은 파일은 락으로 순차 처리
    const concurrency = NAS_FILE_SYNC_CONCURRENCY;
    await this.jobQueue.processJobs(
      NAS_FILE_SYNC_QUEUE_PREFIX,
      this.processFileSyncJob.bind(this),
      { concurrency },
    );
    this.logger.log(`NAS_FILE_SYNC queue registered with concurrency: ${concurrency}`);
  }

  /**
   * 통합 파일 동기화 작업 처리
   * 
   * 파일별 락을 사용하여 같은 파일에 대한 작업은 순차 처리됩니다.
   * 다른 파일에 대한 작업은 병렬로 처리됩니다.
   */
  private async processFileSyncJob(job: Job<NasFileSyncJobData>): Promise<void> {
    const { fileId, action } = job.data;
    const lockKey = `file-sync:${fileId}`;
    const jobStartTime = Date.now();
    const shortFileId = fileId.substring(0, 8);

    // 🔵 작업 시작 로그 (병렬 처리 확인용)
    this.logger.log(
      `[PARALLEL] 📥 JOB_START | file=${shortFileId}... | action=${action} | jobId=${job.id}`,
    );

    // 🟡 락 획득 시도 로그
    this.logger.log(
      `[PARALLEL] 🔐 LOCK_WAIT | file=${shortFileId}... | action=${action} | lockKey=${lockKey}`,
    );

    const lockWaitStart = Date.now();

    // 파일별 락 획득 후 작업 실행 (같은 파일은 순차 처리)
    await this.distributedLock.withLock(
      lockKey,
      async () => {
        const lockWaitTime = Date.now() - lockWaitStart;
        
        // 🟢 락 획득 성공 로그
        this.logger.log(
          `[PARALLEL] 🔓 LOCK_ACQUIRED | file=${shortFileId}... | action=${action} | waitTime=${lockWaitTime}ms`,
        );

        const actionStartTime = Date.now();

        switch (action) {
          case 'upload':
            await this.handleUpload(job);
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
          `[PARALLEL] ✅ JOB_DONE | file=${shortFileId}... | action=${action} | ` +
          `actionTime=${actionDuration}ms | totalTime=${totalDuration}ms | lockWait=${lockWaitTime}ms`,
        );
      },
      { ttl: 60000, waitTimeout: 30000 }, // 60초 TTL, 30초 대기
    );
  }

  // ===== 통합 Job용 핸들러 메서드들 =====

  /**
   * Upload 액션 처리
   */
  private async handleUpload(job: Job<NasFileSyncJobData>): Promise<void> {
    const { fileId, syncEventId } = job.data;
    this.logger.debug(`Handling upload for file: ${fileId}`);

    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      await this.markSyncEventProcessing(syncEvent);

      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable()) {
        this.logger.debug(`File already synced to NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        this.logger.warn(`File not found: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      const readStream = await this.cacheStorage.파일스트림읽기(fileId);
      const objectKey = syncEvent?.targetPath || fileId;
      await this.nasStorage.파일스트림쓰기(objectKey, readStream);

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(objectKey);
      await this.fileStorageObjectRepository.save(nasObject);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully synced file to NAS: ${fileId} -> ${objectKey}`);
    } catch (error) {
      this.logger.error(`Failed to sync file to NAS: ${fileId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Rename 액션 처리
   */
  private async handleRename(job: Job<NasFileSyncJobData>): Promise<void> {
    const { fileId, oldObjectKey, newObjectKey, syncEventId } = job.data;
    this.logger.debug(`Handling rename for file: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);

    if (!oldObjectKey || !newObjectKey) {
      this.logger.error(`Missing oldObjectKey or newObjectKey for rename: ${fileId}`);
      return;
    }

    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      await this.markSyncEventProcessing(syncEvent);

      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable() && nasObject.objectKey === newObjectKey) {
        this.logger.debug(`File already renamed in NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      const targetObjectKey = this.buildRenameTarget(oldObjectKey, newObjectKey);
      await this.nasStorage.파일이동(oldObjectKey, targetObjectKey);

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetObjectKey);
      await this.fileStorageObjectRepository.save(nasObject);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully renamed file in NAS: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);
    } catch (error) {
      this.logger.error(`Failed to rename file in NAS: ${fileId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Move 액션 처리
   */
  private async handleMove(job: Job<NasFileSyncJobData>): Promise<void> {
    const { fileId, sourcePath, targetPath, originalFolderId, targetFolderId, syncEventId } = job.data;
    this.logger.debug(`Handling move for file: ${fileId}, ${sourcePath} -> ${targetPath}`);

    if (!sourcePath || !targetPath || !originalFolderId || !targetFolderId) {
      this.logger.error(`Missing required fields for move: ${fileId}`);
      return;
    }

    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      await this.markSyncEventProcessing(syncEvent);

      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable() && nasObject.objectKey === targetPath) {
        this.logger.debug(`File already moved in NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      const targetFolder = await this.folderRepository.findById(targetFolderId);

      if (!targetFolder || !targetFolder.isActive()) {
        this.logger.warn(`Target folder deleted, reverting file move: ${fileId}`);

        const file = await this.fileRepository.findById(fileId);
        if (file) {
          file.moveTo(originalFolderId);
          await this.fileRepository.save(file);
        }

        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileStorageObjectRepository.save(nasObject);

        await this.markSyncEventDone(syncEvent);
        this.logger.warn(`File move reverted due to deleted target folder: ${fileId}`);
        return;
      }

      await this.nasStorage.파일이동(sourcePath, targetPath);

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetPath);
      await this.fileStorageObjectRepository.save(nasObject);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully moved file in NAS: ${fileId}, ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      this.logger.error(`Failed to move file in NAS: ${fileId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Trash 액션 처리
   */
  private async handleTrash(job: Job<NasFileSyncJobData>): Promise<void> {
    const { fileId, currentObjectKey, trashPath, syncEventId } = job.data;
    this.logger.debug(`Handling trash for file: ${fileId}, ${currentObjectKey} -> ${trashPath}`);

    if (!currentObjectKey || !trashPath) {
      this.logger.error(`Missing currentObjectKey or trashPath for trash: ${fileId}`);
      return;
    }

    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      await this.markSyncEventProcessing(syncEvent);

      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable() && nasObject.objectKey === trashPath) {
        this.logger.debug(`File already moved to trash in NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      if (nasObject.leaseCount > 0) {
        this.logger.warn(`File is being downloaded, retrying later: ${fileId}, leaseCount: ${nasObject.leaseCount}`);
        throw new Error(`FILE_IN_USE: leaseCount=${nasObject.leaseCount}`);
      }

      await this.nasStorage.파일이동(currentObjectKey, trashPath);

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(trashPath);
      await this.fileStorageObjectRepository.save(nasObject);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully moved file to trash in NAS: ${fileId}, ${currentObjectKey} -> ${trashPath}`);
    } catch (error) {
      this.logger.error(`Failed to move file to trash in NAS: ${fileId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Restore 액션 처리 (휴지통에서 파일 복원)
   *
   * 1. 휴지통 메타데이터 조회
   * 2. 파일 엔티티 조회
   * 3. 대상 폴더 유효성 확인
   * 4. NAS에서 휴지통 → 원래 경로로 파일 이동
   * 5. 파일 상태 복원 (TRASHED -> ACTIVE)
   * 6. 휴지통 메타데이터 삭제
   */
  private async handleRestore(job: Job<NasFileSyncJobData>): Promise<void> {
    const { fileId, syncEventId, trashMetadataId, restoreTargetFolderId } = job.data;
    this.logger.debug(`Handling restore for file: ${fileId}`);

    if (!trashMetadataId || !restoreTargetFolderId) {
      this.logger.error(`Missing trashMetadataId or restoreTargetFolderId for restore: ${fileId}`);
      return;
    }

    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      await this.markSyncEventProcessing(syncEvent);

      // 1. 휴지통 메타데이터 조회
      const trashMetadata = await this.trashRepository.findById(trashMetadataId);
      if (!trashMetadata) {
        this.logger.warn(`TrashMetadata not found: ${trashMetadataId}`);
        if (syncEvent) {
          syncEvent.fail('TRASH_METADATA_NOT_FOUND');
          await this.syncEventRepository.save(syncEvent);
        }
        return;
      }

      // 2. 파일 조회
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        this.logger.warn(`File not found: ${fileId}`);
        if (syncEvent) {
          syncEvent.fail('FILE_NOT_FOUND');
          await this.syncEventRepository.save(syncEvent);
        }
        return;
      }

      // 3. 대상 폴더 존재 여부 확인
      const targetFolder = await this.folderRepository.findById(restoreTargetFolderId);
      if (!targetFolder || !targetFolder.isActive()) {
        this.logger.warn(`Target folder not found or deleted: ${restoreTargetFolderId}`);
        if (syncEvent) {
          syncEvent.fail('TARGET_FOLDER_NOT_FOUND');
          await this.syncEventRepository.save(syncEvent);
        }
        return;
      }

      // 4. NAS 스토리지 객체 조회 및 파일 이동
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (nasObject) {
        const trashPath = nasObject.objectKey;
        // 휴지통 파일명에서 trashMetadataId 접두사 제거
        // 예: {trashMetadataId}__20260203023315__333.txt → 20260203023315__333.txt
        const trashFileName = this.extractFileNameFromPath(trashPath);
        const originalNasFileName = this.extractOriginalFileName(trashFileName);

        const folderPath = targetFolder.path.endsWith('/')
          ? targetFolder.path.slice(0, -1)
          : targetFolder.path;
        const restorePath = `${folderPath}/${originalNasFileName}`;

        await this.nasStorage.파일이동(trashPath, restorePath);

        nasObject.updateObjectKey(restorePath);
        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileStorageObjectRepository.save(nasObject);
      }

      // 5. 파일 상태 업데이트
      file.restore(restoreTargetFolderId);
      await this.fileRepository.save(file);

      // 6. 휴지통 메타데이터 삭제
      await this.trashRepository.delete(trashMetadataId);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully restored file: fileId=${fileId}, targetFolder=${restoreTargetFolderId}`);
    } catch (error) {
      this.logger.error(`Failed to restore file: ${fileId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  /**
   * Purge 액션 처리 (파일 영구 삭제)
   *
   * 1. 파일 조회
   * 2. SeaweedFS(캐시)에서 파일 삭제
   * 3. NAS에서 파일 삭제
   * 4. 스토리지 객체 레코드 삭제
   */
  private async handlePurge(job: Job<NasFileSyncJobData>): Promise<void> {
    const { fileId, syncEventId, trashMetadataId } = job.data;
    this.logger.debug(`Handling purge for file: ${fileId}`);

    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      await this.markSyncEventProcessing(syncEvent);

      // 1. 파일 조회
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        this.logger.warn(`File not found for purge: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. SeaweedFS(캐시)에서 파일 삭제
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

      // 3. NAS에서 파일 삭제
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
          if (syncEvent) {
            syncEvent.fail(`NAS_DELETE_ERROR: ${(nasError as Error).message}`);
            await this.syncEventRepository.save(syncEvent);
          }
          throw nasError;
        }
      }

      // 4. 파일 상태를 DELETED로 변경 (NAS 작업 완료 후)
      file.permanentDelete();
      await this.fileRepository.save(file);

      // 5. 휴지통 메타데이터 삭제 (있는 경우)
      if (trashMetadataId) {
        await this.trashRepository.delete(trashMetadataId);
      }

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully purged file: fileId=${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to purge file: ${fileId}`, error);
      // 최종 시도일 때만 실패 처리 (이전 시도는 큐에서 자동 재시도)
      if (job.attemptsMade && job.attemptsMade >= NAS_SYNC_MAX_ATTEMPTS) {
        await this.handleSyncEventFailure(syncEvent, error as Error, job.data);
      }
      throw error;
    }
  }

  // ===== 헬퍼 메서드들 =====

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

  /**
   * 휴지통 파일명에서 trashMetadataId 접두사를 제거하여 원본 NAS 파일명 추출
   * 
   * 예: f60a60a5-fd18-4ca4-b56f-5e2a4cae74dd__20260203023315__333.txt
   *     → 20260203023315__333.txt
   */
  private extractOriginalFileName(trashFileName: string): string {
    const parts = trashFileName.split('__');
    if (parts.length < 2) {
      // '__' 구분자가 없으면 원본 그대로 반환
      return trashFileName;
    }
    // 첫 번째 부분(trashMetadataId)을 제거하고 나머지를 '__'로 연결
    return parts.slice(1).join('__');
  }

  /**
   * rename 대상 objectKey 계산
   * - 기존 타임스탬프(prefix)를 유지
   * - 새 파일명만 교체
   */
  private buildRenameTarget(oldObjectKey: string, newObjectKey: string): string {
    const oldDir = path.posix.dirname(oldObjectKey);
    const oldBase = path.posix.basename(oldObjectKey);
    const newBase = path.posix.basename(newObjectKey);

    const { prefix: oldPrefix, separator: oldSep } = this.parseTimestampPrefix(oldBase);
    const newFileName = this.extractFileName(newBase);
    const targetBase = oldPrefix ? `${oldPrefix}${oldSep}${newFileName}` : newFileName;

    return oldDir === '.' ? targetBase : path.posix.join(oldDir, targetBase);
  }

  private parseTimestampPrefix(fileName: string): { prefix: string | null; separator: string } {
    if (fileName.includes('__')) {
      const [prefix] = fileName.split('__');
      return { prefix, separator: '__' };
    }
    const underscoreIndex = fileName.indexOf('_');
    if (underscoreIndex > 0) {
      const prefix = fileName.substring(0, underscoreIndex);
      if (/^\d{10,}$/.test(prefix)) {
        return { prefix, separator: '_' };
      }
    }
    return { prefix: null, separator: '_' };
  }

  private extractFileName(fileName: string): string {
    if (fileName.includes('__')) {
      return fileName.split('__').slice(1).join('__');
    }
    const underscoreIndex = fileName.indexOf('_');
    if (underscoreIndex > 0) {
      const prefix = fileName.substring(0, underscoreIndex);
      if (/^\d{10,}$/.test(prefix)) {
        return fileName.substring(underscoreIndex + 1);
      }
    }
    return fileName;
  }
}
