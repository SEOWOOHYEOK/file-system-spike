import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../domain/queue/ports/job-queue.port';
import {
  DISTRIBUTED_LOCK_PORT,
} from '../../domain/queue/ports/distributed-lock.port';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { IDistributedLockPort } from '../../domain/queue/ports/distributed-lock.port';

// Action Handlers
import { FolderMkdirHandler } from './handlers/folder-mkdir.handler';
import { FolderRenameHandler } from './handlers/folder-rename.handler';
import { FolderMoveHandler } from './handlers/folder-move.handler';
import { FolderTrashHandler } from './handlers/folder-trash.handler';
import { FolderRestoreHandler } from './handlers/folder-restore.handler';
import { FolderPurgeHandler } from './handlers/folder-purge.handler';

/**
 * NAS 폴더 동기화 Action 타입
 */
export type NasFolderAction = 'mkdir' | 'rename' | 'move' | 'trash' | 'restore' | 'purge';

// ===== 액션별 Job 데이터 인터페이스 =====

/**
 * 기본 Job 데이터 (모든 액션 공통)
 */
interface NasFolderSyncJobBase {
  /** 폴더 ID */
  folderId: string;
  /** SyncEvent 상태 추적용 (선택적) */
  syncEventId?: string;
}

/**
 * mkdir 액션 Job 데이터
 * 폴더 생성
 */
export interface NasFolderMkdirJobData extends NasFolderSyncJobBase {
  action: 'mkdir';
  /** 생성할 폴더 경로 */
  path: string;
}

/**
 * rename 액션 Job 데이터
 * 폴더 이름 변경
 */
export interface NasFolderRenameJobData extends NasFolderSyncJobBase {
  action: 'rename';
  /** 기존 경로 */
  oldPath: string;
  /** 새 경로 */
  newPath: string;
}

/**
 * move 액션 Job 데이터
 * 폴더 이동
 */
export interface NasFolderMoveJobData extends NasFolderSyncJobBase {
  action: 'move';
  /** 기존 경로 */
  oldPath: string;
  /** 새 경로 */
  newPath: string;
  /** 원본 부모 폴더 ID (롤백용) */
  originalParentId?: string | null;
  /** 타겟 부모 폴더 ID */
  targetParentId: string;
}

/**
 * trash 액션 Job 데이터
 * 폴더 휴지통 이동
 */
export interface NasFolderTrashJobData extends NasFolderSyncJobBase {
  action: 'trash';
  /** 현재 폴더 경로 */
  currentPath: string;
  /** 휴지통 경로 */
  trashPath: string;
}

/**
 * restore 액션 Job 데이터
 * 휴지통에서 폴더 복구
 */
export interface NasFolderRestoreJobData extends NasFolderSyncJobBase {
  action: 'restore';
  /** 휴지통 경로 */
  trashPath: string;
  /** 복구 대상 경로 */
  restorePath: string;
  /** 휴지통 메타데이터 ID */
  trashMetadataId: string;
  /** 원본 부모 폴더 ID */
  originalParentId?: string | null;
}

/**
 * purge 액션 Job 데이터
 * 휴지통에서 폴더 영구 삭제
 */
export interface NasFolderPurgeJobData extends NasFolderSyncJobBase {
  action: 'purge';
  /** 휴지통 경로 */
  trashPath: string;
  /** 휴지통 메타데이터 ID */
  trashMetadataId: string;
}

/**
 * NAS 폴더 동기화 통합 Job 데이터 타입 (Union)
 * 
 * 폴더 기반 큐 구조: NAS_FOLDER_SYNC:{folderId}
 * - 같은 폴더에 대한 작업은 순차 처리 보장
 * - 다른 폴더에 대한 작업은 병렬 처리 가능
 */
export type NasFolderSyncJobData =
  | NasFolderMkdirJobData
  | NasFolderRenameJobData
  | NasFolderMoveJobData
  | NasFolderTrashJobData
  | NasFolderRestoreJobData
  | NasFolderPurgeJobData;

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
 * NAS 폴더 동기화 워커 (라우터 패턴)
 *
 * 이 워커는 큐 등록 + 락 획득 + 액션 라우팅만 담당합니다.
 * 실제 비즈니스 로직은 handlers/ 디렉토리의 개별 핸들러에 위임됩니다.
 */
@Injectable()
export class NasFolderSyncWorker implements OnModuleInit {
  private readonly logger = new Logger(NasFolderSyncWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(DISTRIBUTED_LOCK_PORT)
    private readonly distributedLock: IDistributedLockPort,
    // Action Handlers
    private readonly mkdirHandler: FolderMkdirHandler,
    private readonly renameHandler: FolderRenameHandler,
    private readonly moveHandler: FolderMoveHandler,
    private readonly trashHandler: FolderTrashHandler,
    private readonly restoreHandler: FolderRestoreHandler,
    private readonly purgeHandler: FolderPurgeHandler,
  ) { }

  async onModuleInit() {
    this.logger.log('NAS 폴더 동기화 작업 프로세서 등록 중...');

    const concurrency = NAS_FOLDER_SYNC_CONCURRENCY;
    await this.jobQueue.processJobs(
      NAS_FOLDER_SYNC_QUEUE_PREFIX,
      this.processFolderSyncJob.bind(this),
      { concurrency },
    );
    this.logger.log(`NAS_FOLDER_SYNC 큐 등록 완료 (동시처리: ${concurrency})`);
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

    this.logger.log(
      `[PARALLEL] 📥 작업시작 | folder=${shortFolderId}... | action=${action} | jobId=${job.id}`,
    );

    this.logger.log(
      `[PARALLEL] 🔐 락대기 | folder=${shortFolderId}... | action=${action} | lockKey=${lockKey}`,
    );

    const lockWaitStart = Date.now();

    await this.distributedLock.withLock(
      lockKey,
      async () => {
        const lockWaitTime = Date.now() - lockWaitStart;

        this.logger.log(
          `[PARALLEL] 🔓 락획득 | folder=${shortFolderId}... | action=${action} | waitTime=${lockWaitTime}ms`,
        );

        const actionStartTime = Date.now();

        switch (action) {
          case 'mkdir':
            await this.mkdirHandler.execute(job as Job<NasFolderMkdirJobData>);
            break;
          case 'rename':
            await this.renameHandler.execute(job as Job<NasFolderRenameJobData>);
            break;
          case 'move':
            await this.moveHandler.execute(job as Job<NasFolderMoveJobData>);
            break;
          case 'trash':
            await this.trashHandler.execute(job as Job<NasFolderTrashJobData>);
            break;
          case 'restore':
            await this.restoreHandler.execute(job as Job<NasFolderRestoreJobData>);
            break;
          case 'purge':
            await this.purgeHandler.execute(job as Job<NasFolderPurgeJobData>);
            break;
          default:
            this.logger.warn(`알 수 없는 액션: ${action}`);
        }

        const actionDuration = Date.now() - actionStartTime;
        const totalDuration = Date.now() - jobStartTime;

        this.logger.log(
          `[PARALLEL] ✅ 작업완료 | folder=${shortFolderId}... | action=${action} | ` +
          `actionTime=${actionDuration}ms | totalTime=${totalDuration}ms | lockWait=${lockWaitTime}ms`,
        );
      },
      { ttl: 60000, waitTimeout: 30000, autoRenew: true, renewIntervalMs: 25000 },
    );
  }
}
