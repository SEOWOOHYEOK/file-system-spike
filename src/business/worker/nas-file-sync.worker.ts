import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../infra/queue/job-queue.port';
import {
  DISTRIBUTED_LOCK_PORT,
} from '../../infra/queue/distributed-lock.port';
import {
  PROGRESS_STORAGE_PORT,
  type IProgressStoragePort,
  type SyncProgress,
} from '../../infra/queue/progress-storage.port';
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
import { createProgressStream, createProgressLogger, formatBytes } from '../../common/utils';

import type { IJobQueuePort } from '../../infra/queue/job-queue.port';
import type { IDistributedLockPort } from '../../infra/queue/distributed-lock.port';
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
 * - 환경에 따라 조정 가능 (기본값: 5)
 */
export const NAS_FILE_SYNC_CONCURRENCY = 5;

/**
 * 대용량 파일 병렬 업로드 설정
 */
export const PARALLEL_UPLOAD_CONFIG = {
  /** 병렬 업로드 활성화 임계값 (100MB 이상) */
  THRESHOLD_BYTES: 100 * 1024 * 1024,
  /** 청크 크기 (50MB) */
  CHUNK_SIZE: 50 * 1024 * 1024,
  /** 동시 청크 업로드 수 */
  PARALLEL_CHUNKS: 4,
  /** 진행률 로그 출력 간격 (%) */
  PROGRESS_LOG_INTERVAL: 10,
};


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
    @Inject(PROGRESS_STORAGE_PORT)
    private readonly progressStorage: IProgressStoragePort,
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
   * SyncEvent 재시도 처리
   * - 재시도 가능: PENDING 상태로 롤백
   * - 재시도 불가 (한도 초과): FAILED 상태로 마킹 + 알림
   */
  private async handleSyncEventRetry(
    syncEvent: SyncEventEntity | null,
    error: Error,
    jobData: NasFileSyncJobData,
  ): Promise<void> {
    if (!syncEvent) return;
    
    // 상세 에러 메시지 추출 (cause가 있으면 원본 에러 포함)
    const detailMessage = this.extractDetailedErrorMessage(error);
    const shouldRetry = syncEvent.retry(detailMessage);
    await this.syncEventRepository.save(syncEvent);
    if (!shouldRetry) {
      syncEvent.fail(detailMessage);
      await this.syncEventRepository.save(syncEvent);
      this.logSyncFailureAlert(syncEvent, error, jobData);
    }
  }

  /**
   * 에러에서 상세 메시지 추출
   * - cause가 있으면 원본 에러 메시지 포함
   * - 사용자에게는 간략 메시지, DB에는 상세 메시지 저장
   */
  private extractDetailedErrorMessage(error: Error): string {
    const cause = error.cause as Error | undefined;
    if (cause?.message) {
      return `${error.message}: ${cause.message}`;
    }
    return error.message;
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
            await this.handleUpload(job as Job<NasFileUploadJobData>);
            break;
          case 'rename':
            await this.handleRename(job as Job<NasFileRenameJobData>);
            break;
          case 'move':
            await this.handleMove(job as Job<NasFileMoveJobData>);
            break;
          case 'trash':
            await this.handleTrash(job as Job<NasFileTrashJobData>);
            break;
          case 'restore':
            await this.handleRestore(job as Job<NasFileRestoreJobData>);
            break;
          case 'purge':
            await this.handlePurge(job as Job<NasFilePurgeJobData>);
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
      { ttl: 60000, waitTimeout: 30000, autoRenew: true, renewIntervalMs: 25000 }, // 60초 TTL, 30초 대기, 25초마다 자동 갱신
    );
  }

  // ===== 통합 Job용 핸들러 메서드들 =====

  /**
   * Upload 액션 처리
   * 
   * 파일 크기에 따라 전략 분기:
   * - 소용량 (< 100MB): 스트림 방식 + 진행률 로깅
   * - 대용량 (>= 100MB): 청크 병렬 업로드 + 진행률 로깅
   */
  private async handleUpload(job: Job<NasFileUploadJobData>): Promise<void> {
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

      const objectKey = syncEvent?.targetPath || fileId;
      const fileSize = file.sizeBytes;
      const shortFileId = fileId.substring(0, 8);
      const totalChunks = Math.ceil(fileSize / PARALLEL_UPLOAD_CONFIG.CHUNK_SIZE);

      // 진행률 초기화 (syncEventId가 있는 경우에만)
      if (syncEventId) {
        await this.progressStorage.set(syncEventId, {
          fileId,
          syncEventId,
          eventType: 'CREATE',
          status: 'PROCESSING',
          progress: {
            percent: 0,
            completedChunks: 0,
            totalChunks,
            bytesTransferred: 0,
            totalBytes: fileSize,
          },
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // 파일 크기에 따른 전략 분기
      if (fileSize >= PARALLEL_UPLOAD_CONFIG.THRESHOLD_BYTES) {
        // 대용량 파일: 청크 병렬 업로드
        this.logger.log(
          `[PARALLEL_UPLOAD] 🚀 Starting parallel upload | file=${shortFileId}... | ` +
          `size=${formatBytes(fileSize)} | chunks=${Math.ceil(fileSize / PARALLEL_UPLOAD_CONFIG.CHUNK_SIZE)}`,
        );
        await this.parallelUploadToNas(fileId, objectKey, fileSize, syncEventId);
      } else {
        // 소용량 파일: 스트림 방식 + 진행률 로깅
        await this.streamUploadToNas(fileId, objectKey, fileSize);
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(objectKey);
      await this.fileStorageObjectRepository.save(nasObject);

      // 진행률 완료 업데이트 (syncEventId가 있는 경우에만)
      if (syncEventId) {
        await this.progressStorage.update(syncEventId, {
          status: 'DONE',
          progress: {
            percent: 100,
            completedChunks: totalChunks,
            totalChunks,
            bytesTransferred: fileSize,
            totalBytes: fileSize,
          },
        });
      }

      await this.markSyncEventDone(syncEvent);
      this.logger.log(
        `[SYNC_COMPLETE] ✅ Successfully synced to NAS | file=${shortFileId}... | ` +
        `size=${formatBytes(fileSize)} | path=${objectKey}`,
      );
    } catch (error) {
      this.logger.error(`Failed to sync file to NAS: ${fileId}`, error);
      
      // 진행률 실패 업데이트 (syncEventId가 있는 경우에만)
      if (syncEventId) {
        await this.progressStorage.update(syncEventId, {
          status: 'FAILED',
          error: (error as Error).message,
        });
      }
      
      // SyncEvent 재시도 처리 (재시도 가능 시 PENDING으로 롤백)
      await this.handleSyncEventRetry(syncEvent, error as Error, job.data);
      throw error;
    }
  }

  
  /**
   * 스트림 방식 업로드 (소용량 파일용)
   * 진행률 로깅 포함
   */
  private async streamUploadToNas(
    fileId: string,
    objectKey: string,
    fileSize: number,
  ): Promise<void> {
    const readStream = await this.cacheStorage.파일스트림읽기(fileId);
    
    // 진행률 로거 생성
    const { callback: progressCallback } = createProgressLogger(
      this.logger,
      fileId,
      'NAS_SYNC',
      PARALLEL_UPLOAD_CONFIG.PROGRESS_LOG_INTERVAL,
    );
    
    // 진행률 모니터링 스트림 생성
    const progressStream = createProgressStream(fileSize, progressCallback);
    
    // 파이프라인: 캐시 → 진행률 모니터링 → NAS
    await this.nasStorage.파일스트림쓰기(objectKey, readStream.pipe(progressStream));
  }

  /**
   * 청크 병렬 업로드 (대용량 파일용)
   * 
   * 처리 순서:
   * 1. NAS에 파일 사전 할당 (truncate)
   * 2. 캐시에서 청크 단위로 읽기
   * 3. 각 청크를 병렬로 NAS에 쓰기 (pwrite)
   */
  private async parallelUploadToNas(
    fileId: string,
    objectKey: string,
    fileSize: number,
    syncEventId?: string,
  ): Promise<void> {
    const { CHUNK_SIZE, PARALLEL_CHUNKS, PROGRESS_LOG_INTERVAL } = PARALLEL_UPLOAD_CONFIG;
    const shortFileId = fileId.substring(0, 8);

    // 1. NAS에 파일 사전 할당
    await this.nasStorage.파일사전할당(objectKey, fileSize);

    // 2. 청크 정보 계산
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const chunks: Array<{ index: number; start: number; end: number }> = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
      chunks.push({ index: i, start, end });
    }

    // 3. 진행률 추적
    let completedChunks = 0;
    let lastLoggedPercent = 0;

    // 4. 청크 병렬 처리 (동시 실행 수 제한)
    const processChunk = async (chunk: { index: number; start: number; end: number }) => {
      const { index, start, end } = chunk;
      const chunkSize = end - start + 1;

      // 캐시에서 청크 범위 읽기
      const chunkStream = await this.cacheStorage.파일범위스트림읽기(fileId, start, end);
      
      // 스트림을 버퍼로 변환
      const buffers: Buffer[] = [];
      for await (const data of chunkStream) {
        buffers.push(data);
      }
      const chunkBuffer = Buffer.concat(buffers);

      // NAS에 청크 쓰기
      await this.nasStorage.청크쓰기(objectKey, chunkBuffer, start);

      // 진행률 업데이트
      completedChunks++;
      const percent = Math.round((completedChunks / totalChunks) * 100);
      const bytesTransferred = Math.min(completedChunks * CHUNK_SIZE, fileSize);
      
      if (percent >= lastLoggedPercent + PROGRESS_LOG_INTERVAL || percent === 100) {
        // Progress Storage에 진행률 저장 (클라이언트 조회용, syncEventId가 있는 경우에만)
        if (syncEventId) {
          await this.progressStorage.update(syncEventId, {
            status: 'PROCESSING',
            progress: {
              percent,
              completedChunks,
              totalChunks,
              bytesTransferred,
              totalBytes: fileSize,
            },
          });
        }
        
        this.logger.log(
          `[PARALLEL_UPLOAD] 📊 Progress | file=${shortFileId}... | ${percent}% | ` +
          `chunks=${completedChunks}/${totalChunks}`,
        );
        lastLoggedPercent = Math.floor(percent / PROGRESS_LOG_INTERVAL) * PROGRESS_LOG_INTERVAL;
      }
    };

    // 5. 병렬 실행 (동시 실행 수 제한)
    const executeInBatches = async () => {
      for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
        const batch = chunks.slice(i, i + PARALLEL_CHUNKS);
        await Promise.all(batch.map(processChunk));
      }
    };

    await executeInBatches();

    this.logger.log(
      `[PARALLEL_UPLOAD] ✅ All chunks uploaded | file=${shortFileId}... | ` +
      `totalChunks=${totalChunks}`,
    );
  }

  /**
   * Rename 액션 처리
   */
  private async handleRename(job: Job<NasFileRenameJobData>): Promise<void> {
    const { fileId, oldObjectKey, newObjectKey, syncEventId } = job.data;
    this.logger.debug(`Handling rename for file: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);

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

      // NAS 파일 이동 (멱등성 보장)
      try {
        await this.nasStorage.파일이동(oldObjectKey, targetObjectKey);
      } catch (nasError: any) {
        // 소스가 없고 대상이 이미 존재하면 이전 시도에서 완료된 것 (멱등성)
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`File rename already completed (idempotent): ${oldObjectKey} -> ${targetObjectKey}`);
        } else {
          throw nasError;
        }
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetObjectKey);
      await this.fileStorageObjectRepository.save(nasObject);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully renamed file in NAS: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);
    } catch (error) {
      this.logger.error(`Failed to rename file in NAS: ${fileId}`, error);
      // SyncEvent 재시도 처리 (재시도 가능 시 PENDING으로 롤백)
      await this.handleSyncEventRetry(syncEvent, error as Error, job.data);
      throw error;
    }
  }

  /**
   * Move 액션 처리
   */
  private async handleMove(job: Job<NasFileMoveJobData>): Promise<void> {
    const { fileId, sourcePath, targetPath, originalFolderId, targetFolderId, syncEventId } = job.data;
    this.logger.debug(`Handling move for file: ${fileId}, ${sourcePath} -> ${targetPath}`);

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

      // NAS 파일 이동 (멱등성 보장)
      try {
        await this.nasStorage.파일이동(sourcePath, targetPath);
      } catch (nasError: any) {
        // 소스가 없고 대상이 이미 존재하면 이전 시도에서 완료된 것 (멱등성)
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`File move already completed (idempotent): ${sourcePath} -> ${targetPath}`);
        } else {
          throw nasError;
        }
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetPath);
      await this.fileStorageObjectRepository.save(nasObject);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully moved file in NAS: ${fileId}, ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      this.logger.error(`Failed to move file in NAS: ${fileId}`, error);
      // SyncEvent 재시도 처리 (재시도 가능 시 PENDING으로 롤백)
      await this.handleSyncEventRetry(syncEvent, error as Error, job.data);
      throw error;
    }
  }

  /**
   * Trash 액션 처리
   */
  private async handleTrash(job: Job<NasFileTrashJobData>): Promise<void> {
    const { fileId, currentObjectKey, trashPath, syncEventId } = job.data;
    this.logger.debug(`Handling trash for file: ${fileId}, ${currentObjectKey} -> ${trashPath}`);

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

      // NAS 파일 휴지통 이동 (멱등성 보장)
      try {
        await this.nasStorage.파일이동(currentObjectKey, trashPath);
      } catch (nasError: any) {
        // 소스가 없고 대상이 이미 존재하면 이전 시도에서 완료된 것 (멱등성)
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`File trash already completed (idempotent): ${currentObjectKey} -> ${trashPath}`);
        } else {
          throw nasError;
        }
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(trashPath);
      await this.fileStorageObjectRepository.save(nasObject);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully moved file to trash in NAS: ${fileId}, ${currentObjectKey} -> ${trashPath}`);
    } catch (error) {
      this.logger.error(`Failed to move file to trash in NAS: ${fileId}`, error);
      // SyncEvent 재시도 처리 (재시도 가능 시 PENDING으로 롤백)
      await this.handleSyncEventRetry(syncEvent, error as Error, job.data);
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
  private async handleRestore(job: Job<NasFileRestoreJobData>): Promise<void> {
    const { fileId, syncEventId, trashMetadataId, restoreTargetFolderId } = job.data;
    this.logger.debug(`Handling restore for file: ${fileId}`);

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

        // NAS 파일 복원 이동 (멱등성 보장)
        try {
          await this.nasStorage.파일이동(trashPath, restorePath);
        } catch (nasError: any) {
          // 소스가 없고 대상이 이미 존재하면 이전 시도에서 완료된 것 (멱등성)
          if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
            this.logger.debug(`File restore already completed (idempotent): ${trashPath} -> ${restorePath}`);
          } else {
            throw nasError;
          }
        }

        nasObject.updateObjectKey(restorePath);
        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileStorageObjectRepository.save(nasObject);
      }

      // 5. 파일 상태 업데이트 (Service에서 이미 처리된 경우 스킵)
      if (file.isTrashed()) {
        file.restore(restoreTargetFolderId);
        await this.fileRepository.save(file);
      }

      // 6. 휴지통 메타데이터 삭제
      await this.trashRepository.delete(trashMetadataId);

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully restored file: fileId=${fileId}, targetFolder=${restoreTargetFolderId}`);
    } catch (error) {
      this.logger.error(`Failed to restore file: ${fileId}`, error);
      // SyncEvent 재시도 처리 (재시도 가능 시 PENDING으로 롤백)
      await this.handleSyncEventRetry(syncEvent, error as Error, job.data);
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
  private async handlePurge(job: Job<NasFilePurgeJobData>): Promise<void> {
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
      if (file.isTrashed()) {
        file.permanentDelete();
        await this.fileRepository.save(file);
      }

      // 5. 휴지통 메타데이터 삭제 (있는 경우)
      if (trashMetadataId) {
        await this.trashRepository.delete(trashMetadataId);
      }

      await this.markSyncEventDone(syncEvent);
      this.logger.log(`Successfully purged file: fileId=${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to purge file: ${fileId}`, error);
      // SyncEvent 재시도 처리 (재시도 가능 시 PENDING으로 롤백)
      await this.handleSyncEventRetry(syncEvent, error as Error, job.data);
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
