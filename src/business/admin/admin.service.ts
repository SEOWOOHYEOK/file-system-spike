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
import { SyncEventsResponseDto } from '../../interface/controller/admin/dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly cacheHealthCheckService: CacheHealthCheckService,
    private readonly nasHealthCheckService: NasHealthCheckService,
    private readonly storageConsistencyService: StorageConsistencyService,
    private readonly syncEventStatsService: SyncEventStatsService,
  ) {}

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
      })),
      pagination: {
        limit: params.limit,
        offset: params.offset,
        hasMore,
      },
      checkedAt: new Date(),
    };
  }
}
