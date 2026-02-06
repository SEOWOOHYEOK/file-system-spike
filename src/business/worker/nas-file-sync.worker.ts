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
import { FileUploadHandler } from './handlers/file-upload.handler';
import { FileRenameHandler } from './handlers/file-rename.handler';
import { FileMoveHandler } from './handlers/file-move.handler';
import { FileTrashHandler } from './handlers/file-trash.handler';
import { FileRestoreHandler } from './handlers/file-restore.handler';
import { FilePurgeHandler } from './handlers/file-purge.handler';

/**
 * NAS 파일 동기화 Action 타입
 */
export type NasFileAction = 'upload' | 'rename' | 'move' | 'trash' | 'restore' | 'purge';

// ===== 액션별 Job 데이터 인터페이스 =====

/**
 * 기본 Job 데이터 (모든 액션 공통)
 */
interface NasFileSyncJobBase {
  /** 파일 ID */
  fileId: string;
  /** SyncEvent 상태 추적용 (선택적) */
  syncEventId?: string;
}

/**
 * upload 액션 Job 데이터
 * 파일을 NAS에 업로드
 */
export interface NasFileUploadJobData extends NasFileSyncJobBase {
  action: 'upload';
}

/**
 * rename 액션 Job 데이터
 * 파일 이름 변경
 */
export interface NasFileRenameJobData extends NasFileSyncJobBase {
  action: 'rename';
  /** 기존 객체 키 */
  oldObjectKey: string;
  /** 새 객체 키 */
  newObjectKey: string;
}

/**
 * move 액션 Job 데이터
 * 파일 이동
 */
export interface NasFileMoveJobData extends NasFileSyncJobBase {
  action: 'move';
  /** 소스 경로 */
  sourcePath: string;
  /** 타겟 경로 */
  targetPath: string;
  /** 원본 폴더 ID (롤백용) */
  originalFolderId: string;
  /** 타겟 폴더 ID */
  targetFolderId: string;
}

/**
 * trash 액션 Job 데이터
 * 파일 휴지통 이동
 */
export interface NasFileTrashJobData extends NasFileSyncJobBase {
  action: 'trash';
  /** 현재 객체 키 */
  currentObjectKey: string;
  /** 휴지통 경로 */
  trashPath: string;
}

/**
 * restore 액션 Job 데이터
 * 휴지통에서 파일 복원
 */
export interface NasFileRestoreJobData extends NasFileSyncJobBase {
  action: 'restore';
  /** 휴지통 메타데이터 ID */
  trashMetadataId: string;
  /** 복원 대상 폴더 ID */
  restoreTargetFolderId: string;
  /** 작업 수행 사용자 ID */
  userId?: string;
}

/**
 * purge 액션 Job 데이터
 * 파일 영구 삭제
 */
export interface NasFilePurgeJobData extends NasFileSyncJobBase {
  action: 'purge';
  /** 휴지통 메타데이터 ID (선택) */
  trashMetadataId?: string;
  /** 작업 수행 사용자 ID */
  userId?: string;
}

/**
 * NAS 파일 동기화 통합 Job 데이터 타입 (Union)
 * 
 * 파일 기반 큐 구조: NAS_FILE_SYNC:{fileId}
 * - 같은 파일에 대한 작업은 순차 처리 보장
 * - 다른 파일에 대한 작업은 병렬 처리 가능
 */
export type NasFileSyncJobData =
  | NasFileUploadJobData
  | NasFileRenameJobData
  | NasFileMoveJobData
  | NasFileTrashJobData
  | NasFileRestoreJobData
  | NasFilePurgeJobData;

/**
 * NAS 파일 동기화 큐 설정
 */
export const NAS_FILE_SYNC_QUEUE_PREFIX = 'NAS_FILE_SYNC';

/**
 * 동시 처리 수 (concurrency)
 * - 다른 파일은 병렬 처리
 * - 같은 파일은 파일별 락으로 순차 처리 보장
 * - 환경변수: NAS_FILE_SYNC_CONCURRENCY (기본값: 5)
 */
export const NAS_FILE_SYNC_CONCURRENCY = parseInt(
  process.env.NAS_FILE_SYNC_CONCURRENCY || '5',
  10,
);

/**
 * 대용량 파일 병렬 업로드 설정
 * 환경변수로 관리 (기본값은 fallback)
 */
export const PARALLEL_UPLOAD_CONFIG = {
  /** 병렬 업로드 활성화 임계값 (기본 100MB) */
  THRESHOLD_BYTES: parseInt(
    process.env.NAS_PARALLEL_UPLOAD_THRESHOLD_BYTES || String(100 * 1024 * 1024),
    10,
  ),
  /** 청크 크기 (기본 50MB) */
  CHUNK_SIZE: parseInt(
    process.env.NAS_PARALLEL_UPLOAD_CHUNK_SIZE || String(50 * 1024 * 1024),
    10,
  ),
  /** 동시 청크 업로드 수 (기본 4) */
  PARALLEL_CHUNKS: parseInt(
    process.env.NAS_PARALLEL_UPLOAD_CHUNKS || '4',
    10,
  ),
  /** 진행률 로그 출력 간격 (%, 기본 5) */
  PROGRESS_LOG_INTERVAL: parseInt(
    process.env.NAS_PARALLEL_UPLOAD_PROGRESS_INTERVAL || '5',
    10,
  ),
};


/**
 * NAS 파일 동기화 워커 (라우터 패턴)
 *
 * 이 워커는 큐 등록 + 락 획득 + 액션 라우팅만 담당합니다.
 * 실제 비즈니스 로직은 handlers/ 디렉토리의 개별 핸들러에 위임됩니다.
 */
@Injectable()
export class NasSyncWorker implements OnModuleInit {
  private readonly logger = new Logger(NasSyncWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(DISTRIBUTED_LOCK_PORT)
    private readonly distributedLock: IDistributedLockPort,
    // Action Handlers
    private readonly uploadHandler: FileUploadHandler,
    private readonly renameHandler: FileRenameHandler,
    private readonly moveHandler: FileMoveHandler,
    private readonly trashHandler: FileTrashHandler,
    private readonly restoreHandler: FileRestoreHandler,
    private readonly purgeHandler: FilePurgeHandler,
  ) { }

  async onModuleInit() {
    this.logger.log('NAS 파일 동기화 작업 프로세서 등록 중...');

    const concurrency = NAS_FILE_SYNC_CONCURRENCY;
    await this.jobQueue.processJobs(
      NAS_FILE_SYNC_QUEUE_PREFIX,
      this.processFileSyncJob.bind(this),
      { concurrency },
    );
    this.logger.log(`NAS_FILE_SYNC 큐 등록 완료 (동시처리: ${concurrency})`);
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

    this.logger.log(
      `[PARALLEL] 📥 작업시작 | file=${shortFileId}... | action=${action} | jobId=${job.id}`,
    );

    this.logger.log(
      `[PARALLEL] 🔐 락대기 | file=${shortFileId}... | action=${action} | lockKey=${lockKey}`,
    );

    const lockWaitStart = Date.now();

    await this.distributedLock.withLock(
      lockKey,
      async () => {
        const lockWaitTime = Date.now() - lockWaitStart;

        this.logger.log(
          `[PARALLEL] 🔓 락획득 | file=${shortFileId}... | action=${action} | waitTime=${lockWaitTime}ms`,
        );

        const actionStartTime = Date.now();

        switch (action) {
          case 'upload':
            await this.uploadHandler.execute(job as Job<NasFileUploadJobData>);
            break;
          case 'rename':
            await this.renameHandler.execute(job as Job<NasFileRenameJobData>);
            break;
          case 'move':
            await this.moveHandler.execute(job as Job<NasFileMoveJobData>);
            break;
          case 'trash':
            await this.trashHandler.execute(job as Job<NasFileTrashJobData>);
            break;
          case 'restore':
            await this.restoreHandler.execute(job as Job<NasFileRestoreJobData>);
            break;
          case 'purge':
            await this.purgeHandler.execute(job as Job<NasFilePurgeJobData>);
            break;
          default:
            this.logger.warn(`알 수 없는 액션: ${action}`);
        }

        const actionDuration = Date.now() - actionStartTime;
        const totalDuration = Date.now() - jobStartTime;

        this.logger.log(
          `[PARALLEL] ✅ 작업완료 | file=${shortFileId}... | action=${action} | ` +
          `actionTime=${actionDuration}ms | totalTime=${totalDuration}ms | lockWait=${lockWaitTime}ms`,
        );
      },
      { ttl: 60000, waitTimeout: 30000, autoRenew: true, renewIntervalMs: 25000 },
    );
  }
}
