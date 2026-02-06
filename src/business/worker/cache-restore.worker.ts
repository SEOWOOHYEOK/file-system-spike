/**
 * 캐시 복원 Worker
 *
 * NAS에서 다운로드된 파일을 캐시 서버에 복원합니다.
 * - CACHE_RESTORE 큐의 작업을 처리
 * - NAS에서 전체 파일을 읽어 캐시 스토리지에 저장
 * - FileStorageObjectEntity (CACHE 타입) 생성/상태 관리
 * - 멱등성 보장: 이미 캐시에 존재하면 DB 상태만 보정
 * - 분산 락으로 동일 파일 동시 복원 방지
 */
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';

import {
  JOB_QUEUE_PORT,
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
  AvailabilityStatus,
} from '../../domain/file';

import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';

import type { IJobQueuePort, Job } from '../../domain/queue/ports/job-queue.port';
import type { IDistributedLockPort } from '../../domain/queue/ports/distributed-lock.port';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';

/**
 * 캐시 복원 작업 데이터
 */
export interface CacheRestoreJobData {
  /** 파일 ID */
  fileId: string;
  /** NAS 스토리지 객체 키 */
  nasObjectKey: string;
}

/**
 * 캐시 복원 큐 이름
 */
export const CACHE_RESTORE_QUEUE = 'CACHE_RESTORE';

/**
 * 동시 처리 수 (concurrency)
 * 환경변수: CACHE_RESTORE_CONCURRENCY (기본값: 3)
 */
export const CACHE_RESTORE_CONCURRENCY = parseInt(
  process.env.CACHE_RESTORE_CONCURRENCY || '3',
  10,
);

@Injectable()
export class CacheRestoreWorker implements OnModuleInit {
  private readonly logger = new Logger(CacheRestoreWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(DISTRIBUTED_LOCK_PORT)
    private readonly distributedLock: IDistributedLockPort,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
  ) {}

  async onModuleInit() {
    this.logger.log('CACHE_RESTORE 작업 프로세서 등록 중...');

    await this.jobQueue.processJobs<CacheRestoreJobData>(
      CACHE_RESTORE_QUEUE,
      this.processCacheRestoreJob.bind(this),
      { concurrency: CACHE_RESTORE_CONCURRENCY },
    );

    this.logger.log(
      `CACHE_RESTORE 큐 등록 완료 (동시처리: ${CACHE_RESTORE_CONCURRENCY})`,
    );
  }

  /**
   * 캐시 복원 작업 처리
   *
   * 분산 락으로 동일 파일에 대한 동시 복원을 방지하고,
   * NAS에서 전체 파일을 읽어 캐시 스토리지에 저장합니다.
   */
  private async processCacheRestoreJob(job: Job<CacheRestoreJobData>): Promise<void> {
    const { fileId, nasObjectKey } = job.data;
    const shortFileId = fileId.substring(0, 8);
    const lockKey = `cache-restore:${fileId}`;

    this.logger.log(
      `[CACHE_RESTORE] 시작 | file=${shortFileId}... | nasKey=${nasObjectKey} | jobId=${job.id}`,
    );

    const startTime = Date.now();

    await this.distributedLock.withLock(
      lockKey,
      async () => {
        await this.restoreFileToCache(fileId, nasObjectKey);
      },
      { ttl: 120000, waitTimeout: 5000 }, // 120초 TTL, 5초 대기 (이미 복원 중이면 스킵)
    );

    const duration = Date.now() - startTime;
    this.logger.log(
      `[CACHE_RESTORE] 완료 | file=${shortFileId}... | duration=${duration}ms`,
    );
  }

  /**
   * 파일을 NAS에서 캐시로 복원하는 핵심 로직
   *
   * 1. 캐시에 이미 파일이 존재하면 DB 상태만 보정하고 스킵 (멱등성)
   * 2. NAS storage object 상태가 AVAILABLE인지 확인
   * 3. NAS에서 전체 파일 스트림 읽기
   * 4. 캐시 스토리지에 파일 스트림 쓰기
   * 5. FileStorageObject (CACHE) 생성/상태 업데이트 → AVAILABLE
   * 6. 파일 무결성 검증 (사이즈 비교)
   */
  private async restoreFileToCache(fileId: string, nasObjectKey: string): Promise<void> {
    const shortFileId = fileId.substring(0, 8);

    // ── 1. 캐시 파일 이미 존재 여부 확인 (멱등성) ──
    const cacheFileExists = await this.cacheStorage.파일존재확인(fileId);
    const existingCacheObject = await this.fileCacheStorageDomainService.조회(fileId);

    if (cacheFileExists && existingCacheObject?.isAvailable()) {
      this.logger.debug(
        `[CACHE_RESTORE] 건너뜀 (이미 캐시됨) | file=${shortFileId}...`,
      );
      return;
    }

    // 파일은 있는데 DB 상태가 불일치하면 보정
    if (cacheFileExists && existingCacheObject && !existingCacheObject.isAvailable()) {
      this.logger.log(
        `[CACHE_RESTORE] 상태보정 | file=${shortFileId}... | DB status=${existingCacheObject.availabilityStatus} → AVAILABLE`,
      );
      existingCacheObject.updateStatus(AvailabilityStatus.AVAILABLE);
      await this.fileCacheStorageDomainService.저장(existingCacheObject);
      return;
    }

    if (cacheFileExists && !existingCacheObject) {
      this.logger.log(
        `[CACHE_RESTORE] 레코드생성 | file=${shortFileId}... | 파일은 존재하나 DB 레코드 없음`,
      );
      await this.fileCacheStorageDomainService.생성({
        id: uuidv4(),
        fileId,
        objectKey: fileId,
      });
      return;
    }

    // ── 2. NAS storage object 상태 확인 ──
    const nasObject = await this.fileNasStorageDomainService.조회(fileId);

    if (!nasObject || !nasObject.isAvailable()) {
      this.logger.warn(
        `[CACHE_RESTORE] 중단 (NAS 사용불가) | file=${shortFileId}... | ` +
        `nasStatus=${nasObject?.availabilityStatus ?? 'NOT_FOUND'}`,
      );
      return;
    }

    // ── 3. NAS에서 파일 스트림 읽기 → 캐시에 쓰기 ──
    try {
      const nasStream = await this.nasStorage.파일스트림읽기(nasObjectKey);
      await this.cacheStorage.파일스트림쓰기(fileId, nasStream);

      this.logger.debug(
        `[CACHE_RESTORE] 파일복사완료 | file=${shortFileId}... | nasKey=${nasObjectKey}`,
      );
    } catch (error) {
      this.logger.error(
        `[CACHE_RESTORE] 복사실패 | file=${shortFileId}...`,
        error,
      );

      // 불완전 파일 정리 시도
      try {
        const partialExists = await this.cacheStorage.파일존재확인(fileId);
        if (partialExists) {
          await this.cacheStorage.파일삭제(fileId);
          this.logger.debug(
            `[CACHE_RESTORE] 불완전파일정리 | file=${shortFileId}...`,
          );
        }
      } catch (cleanupError) {
        this.logger.warn(
          `[CACHE_RESTORE] 정리실패 | file=${shortFileId}...`,
          cleanupError,
        );
      }

      // 기존 캐시 객체가 있으면 MISSING 상태로 마킹
      if (existingCacheObject) {
        existingCacheObject.updateStatus(AvailabilityStatus.MISSING);
        await this.fileCacheStorageDomainService.저장(existingCacheObject);
      }

      throw error;
    }

    // ── 4. 파일 무결성 검증 (사이즈 비교) ──
    try {
      const cachedSize = await this.cacheStorage.파일크기조회(fileId);
      const nasSize = await this.nasStorage.파일크기조회(nasObjectKey);

      if (cachedSize !== nasSize) {
        this.logger.error(
          `[CACHE_RESTORE] 크기불일치 | file=${shortFileId}... | ` +
          `cached=${cachedSize} | nas=${nasSize}`,
        );

        // 불일치 파일 삭제
        await this.cacheStorage.파일삭제(fileId);

        if (existingCacheObject) {
          existingCacheObject.updateStatus(AvailabilityStatus.MISSING);
          await this.fileCacheStorageDomainService.저장(existingCacheObject);
        }

        throw new Error(
          `Cache restore size mismatch: cached=${cachedSize}, nas=${nasSize}`,
        );
      }
    } catch (error) {
      // 파일크기조회 자체가 실패한 경우 (파일은 이미 저장됨)
      if ((error as Error).message?.includes('size mismatch')) {
        throw error;
      }
      // 크기 비교 실패는 경고만 하고 계속 진행 (파일 자체는 저장됨)
      this.logger.warn(
        `[CACHE_RESTORE] 크기검증건너뜀 | file=${shortFileId}... | reason=${(error as Error).message}`,
      );
    }

    // ── 5. FileStorageObject (CACHE) DB 레코드 생성/업데이트 ──
    if (existingCacheObject) {
      existingCacheObject.updateStatus(AvailabilityStatus.AVAILABLE);
      await this.fileCacheStorageDomainService.저장(existingCacheObject);
      this.logger.debug(
        `[CACHE_RESTORE] 상태업데이트 | file=${shortFileId}... | → AVAILABLE`,
      );
    } else {
      await this.fileCacheStorageDomainService.생성({
        id: uuidv4(),
        fileId,
        objectKey: fileId,
      });
      this.logger.debug(
        `[CACHE_RESTORE] 레코드생성완료 | file=${shortFileId}... | → AVAILABLE`,
      );
    }
  }
}
