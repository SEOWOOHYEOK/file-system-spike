/**
 * Admin 비즈니스 서비스
 * Admin API의 비즈니스 로직을 조율합니다.
 */
import { Injectable } from '@nestjs/common';
import { CacheHealthCheckService, CacheHealthResult } from '../../infra/storage/cache/cache-health-check.service';
import { NasHealthCheckService, NasHealthResult } from '../../infra/storage/nas/nas-health-check.service';
import {
  StorageConsistencyService,
  StorageConsistencyResult,
  ConsistencyCheckParams,
} from './storage-consistency.service';
import {
  SyncEventStatsService,
  FindSyncEventsParams,
} from './sync-event-stats.service';
import { CacheEvictionWorker } from '../worker/cache-eviction.worker';
import {
  SyncEventsResponseDto,
  CacheUsageResponseDto,
  CacheEvictionResponseDto,
} from '../../interface/controller/admin/dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly cacheHealthCheckService: CacheHealthCheckService,
    private readonly nasHealthCheckService: NasHealthCheckService,
    private readonly storageConsistencyService: StorageConsistencyService,
    private readonly syncEventStatsService: SyncEventStatsService,
    private readonly cacheEvictionWorker: CacheEvictionWorker,
  ) { }

  /**
   * 캐시 스토리지 연결 상태 확인
   * @returns Cache Health Check 결과
   */
  async checkCacheHealth(): Promise<CacheHealthResult> {
    return this.cacheHealthCheckService.checkHealth();
  }

  /**
   * NAS 스토리지 연결 상태 및 용량 확인
   * @returns NAS Health Check 결과 (용량 정보 포함)
   */
  async checkNasHealth(): Promise<NasHealthResult> {
    return this.nasHealthCheckService.checkHealth();
  }

  /**
   * 스토리지 일관성 검증
   * DB와 실제 스토리지 간의 일관성을 확인합니다.
   * @param params 검증 파라미터
   * @returns 일관성 검증 결과
   */
  async checkStorageConsistency(params: ConsistencyCheckParams): Promise<StorageConsistencyResult> {
    return this.storageConsistencyService.checkConsistency(params);
  }

  /**
   * 동기화 이벤트 조회
   * 전체 또는 조건에 맞는 동기화 이벤트를 조회합니다.
   * @param params 조회 파라미터
   * @returns 동기화 이벤트 조회 결과
   */
  async getSyncEvents(params: FindSyncEventsParams): Promise<SyncEventsResponseDto> {
    const result = await this.syncEventStatsService.findSyncEvents(params);

    // 페이징 정보의 hasMore 계산
    const hasMore = params.offset + params.limit < result.summary.total;

    return {
      summary: result.summary,
      events: result.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        targetType: event.targetType,
        fileId: event.fileId,
        folderId: event.folderId,
        sourcePath: event.sourcePath,
        targetPath: event.targetPath,
        status: event.status,
        retryCount: event.retryCount,
        maxRetries: event.maxRetries,
        errorMessage: event.errorMessage,
        metadata: event.metadata,
        processedAt: event.processedAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        isStuck: event.isStuck,
        ageHours: event.ageHours,
        userId: event.processBy,
      })),
      pagination: {
        limit: params.limit,
        offset: params.offset,
        hasMore,
      },
      checkedAt: new Date(),
    };
  }

  /**
   * 캐시 사용 현황 조회
   * DB 통계 + 디스크 실제 통계 + 미동기화 현황 포함
   * @returns 캐시 사용 현황
   */
  async getCacheUsage(): Promise<CacheUsageResponseDto> {
    const status = await this.cacheEvictionWorker.getCacheStatus();

    return {
      currentBytes: status.currentBytes,
      maxBytes: status.maxBytes,
      usagePercent: Math.round(status.usagePercent * 100) / 100,
      thresholdPercent: status.thresholdPercent,
      targetPercent: status.targetPercent,
      currentBytesFormatted: this.formatBytes(status.currentBytes),
      maxBytesFormatted: this.formatBytes(status.maxBytes),
      db: {
        totalCount: status.db.totalCount,
        byStatus: status.db.byStatus,
        leasedCount: status.db.leasedCount,
        unsyncedToNasCount: status.db.unsyncedToNasCount,
        evictableCount: status.db.evictableCount,
      },
      disk: {
        fileCount: status.disk.fileCount,
        totalBytes: status.disk.totalBytes,
        totalBytesFormatted: this.formatBytes(status.disk.totalBytes),
      },
      checkedAt: new Date(),
    };
  }

  /**
   * 수동 캐시 Eviction 실행
   * @returns Eviction 결과
   */
  async runCacheEviction(): Promise<CacheEvictionResponseDto> {
    const result = await this.cacheEvictionWorker.runEviction();

    return {
      evictedCount: result.evictedCount,
      freedBytes: result.freedBytes,
      freedBytesFormatted: this.formatBytes(result.freedBytes),
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      executedAt: new Date(),
    };
  }

  /**
   * 동기화 대시보드 조회
   * 현재 진행 중인 동기화 작업 현황을 한눈에 볼 수 있습니다.
   */
  async getSyncDashboard(): Promise<SyncDashboardResponseDto> {
    // SyncEvent 상태별 요약
    const syncEventsResult = await this.syncEventStatsService.findSyncEvents({
      hours: 24,
      limit: 1000,
      offset: 0,
    });

    // 현재 진행 중인 작업 (PENDING, QUEUED, PROCESSING, RETRYING)
    const activeEvents = syncEventsResult.events.filter(
      (e) => ['PENDING', 'QUEUED', 'PROCESSING', 'RETRYING'].includes(e.status),
    );

    // 사용자별 대기 현황 집계
    const userStatsMap = new Map<string, {
      pendingCount: number;
      queuedCount: number;
      processingCount: number;
      retryingCount: number;
      stuckCount: number;
      oldestJobAt?: Date;
    }>();

    for (const event of activeEvents) {
      const userId = event.processBy || 'unknown';
      const existing = userStatsMap.get(userId) || {
        pendingCount: 0,
        queuedCount: 0,
        processingCount: 0,
        retryingCount: 0,
        stuckCount: 0,
        oldestJobAt: undefined,
      };

      // 상태별 카운트
      if (event.status === 'PENDING') existing.pendingCount++;
      if (event.status === 'QUEUED') existing.queuedCount++;
      if (event.status === 'PROCESSING') existing.processingCount++;
      if (event.status === 'RETRYING') existing.retryingCount++;

      // stuck 카운트
      if (event.isStuck) existing.stuckCount++;

      // 가장 오래된 작업 시간
      if (!existing.oldestJobAt || event.createdAt < existing.oldestJobAt) {
        existing.oldestJobAt = event.createdAt;
      }

      userStatsMap.set(userId, existing);
    }

    // 사용자별 통계를 배열로 변환하고 정렬
    const byUser: UserPendingStats[] = Array.from(userStatsMap.entries())
      .map(([userId, stats]) => ({
        userId,
        pendingCount: stats.pendingCount,
        queuedCount: stats.queuedCount,
        processingCount: stats.processingCount,
        retryingCount: stats.retryingCount,
        totalActiveCount: stats.pendingCount + stats.queuedCount + stats.processingCount + stats.retryingCount,
        stuckCount: stats.stuckCount,
        oldestJobAt: stats.oldestJobAt,
      }))
      .sort((a, b) => b.totalActiveCount - a.totalActiveCount);

    // 최근 실패한 작업
    const recentFailed = syncEventsResult.events
      .filter((e) => e.status === 'FAILED')

    return {
      summary: {
        pending: syncEventsResult.summary.pending,
        queued: syncEventsResult.events.filter((e) => e.status === 'QUEUED').length,
        processing: syncEventsResult.summary.processing,
        retrying: syncEventsResult.events.filter((e) => e.status === 'RETRYING').length,
        done: syncEventsResult.summary.done,
        failed: syncEventsResult.summary.failed,
        stuckCount: syncEventsResult.summary.stuckPending + syncEventsResult.summary.stuckProcessing,
      },
      byUser,
      activeJobs: activeEvents.map((e) => ({
        syncEventId: e.id,
        eventType: e.eventType,
        targetType: e.targetType,
        fileId: e.fileId,
        folderId: e.folderId,
        status: e.status,
        retryCount: e.retryCount,
        maxRetries: e.maxRetries,
        isStuck: e.isStuck,
        ageHours: Math.round(e.ageHours * 100) / 100,
        createdAt: e.createdAt,
        errorMessage: e.errorMessage,
        userId: e.processBy || 'unknown',
      })),
      recentFailed: recentFailed.map((e) => ({
        syncEventId: e.id,
        eventType: e.eventType,
        targetType: e.targetType,
        fileId: e.fileId,
        folderId: e.folderId,
        errorMessage: e.errorMessage,
        retryCount: e.retryCount,
        createdAt: e.createdAt,
        userId: e.processBy || 'unknown',
      })),
      checkedAt: new Date(),
    };
  }

  /**
   * 바이트를 읽기 쉬운 형식으로 변환
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }
}

/**
 * 사용자별 대기 현황
 */
export interface UserPendingStats {
  userId: string;
  pendingCount: number;
  queuedCount: number;
  processingCount: number;
  retryingCount: number;
  totalActiveCount: number;
  stuckCount: number;
  oldestJobAt?: Date;
}

/**
 * 동기화 대시보드 응답 DTO
 */
export interface SyncDashboardResponseDto {
  summary: {
    pending: number;
    queued: number;
    processing: number;
    retrying: number;
    done: number;
    failed: number;
    stuckCount: number;
  };
  /** 사용자별 대기 현황 (활성 작업 수 내림차순 정렬) */
  byUser: UserPendingStats[];
  activeJobs: {
    syncEventId: string;
    eventType: string;
    targetType: string;
    fileId?: string;
    folderId?: string;
    status: string;
    retryCount: number;
    maxRetries: number;
    isStuck: boolean;
    ageHours: number;
    createdAt: Date;
    errorMessage?: string;
    userId: string;
  }[];
  recentFailed: {
    syncEventId: string;
    eventType: string;
    targetType: string;
    fileId?: string;
    folderId?: string;
    errorMessage?: string;
    retryCount: number;
    createdAt: Date;
    userId: string;
  }[];
  checkedAt: Date;
}
