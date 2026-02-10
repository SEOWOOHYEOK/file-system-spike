/**
 * ============================================================
 * Admin 동기화 이벤트 Domain Service
 * ============================================================
 *
 * 📋 비즈니스 맥락:
 *   - 동기화 이벤트 조회 및 진단 Admin 기능
 *   - 전체 이벤트 조회 및 필터링
 *   - stuck 상태 (장시간 대기/처리 중) 이벤트 탐지
 *
 * ⚠️ stuck 판단 기준:
 *   - PENDING: 1시간 이상 대기
 *   - PROCESSING: 30분 이상 처리 중
 * ============================================================
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  SyncEventEntity,
  SyncEventStatus,
  SyncEventType,
} from '../../domain/sync-event/entities/sync-event.entity';
import { SyncEventDomainService } from '../../domain/sync-event';
import {
  SYNC_EVENT_REPOSITORY,
  type ISyncEventRepository,
  type SyncEventFilterParams,
} from '../../domain/sync-event/repositories/sync-event.repository.interface';

/**
 * 이벤트 조회 결과
 */
export interface SyncEventsResult {
  /** stuck 정보가 추가된 이벤트 목록 */
  events: EnrichedSyncEvent[];
  /** 상태별 요약 */
  summary: SyncEventSummary;
}

/**
 * stuck 정보가 추가된 동기화 이벤트
 */
export interface EnrichedSyncEvent extends SyncEventEntity {
  /** stuck 상태 여부 */
  isStuck: boolean;
  /** 생성 후 경과 시간 (시간 단위) */
  ageHours: number;
}

/**
 * 동기화 이벤트 요약 정보
 */
export interface SyncEventSummary {
  /** 전체 이벤트 수 */
  total: number;
  /** 실패 이벤트 수 */
  failed: number;
  /** 대기 중 이벤트 수 */
  pending: number;
  /** 처리 중 이벤트 수 */
  processing: number;
  /** 완료된 이벤트 수 */
  done: number;
  /** stuck 상태의 대기 중 이벤트 수 */
  stuckPending: number;
  /** stuck 상태의 처리 중 이벤트 수 */
  stuckProcessing: number;
}

/**
 * 대시보드 이벤트 조회 파라미터 (findWithFilters용)
 */
export type DashboardEventsParams = SyncEventFilterParams;

/**
 * 이벤트 조회 파라미터
 */
export interface FindSyncEventsParams {
  /** 필터링할 상태 (미지정시 전체 조회) */
  status?: SyncEventStatus;
  /** 필터링할 이벤트 타입 */
  eventType?: SyncEventType;
  /** 조회할 시간 범위 (시간 단위, 기본값: 24) */
  hours?: number;
  /** 페이징 - 조회 개수 */
  limit: number;
  /** 페이징 - 시작 위치 */
  offset: number;
}

/**
 * stuck 판단 기준 상수
 */
const STUCK_PENDING_HOURS = 1; // PENDING 상태에서 1시간 이상이면 stuck
const STUCK_PROCESSING_MS = 30 * 60 * 1000; // PROCESSING 상태에서 30분 이상이면 stuck

@Injectable()
export class SyncEventStatsService {
  constructor(
    private readonly syncEventDomainService: SyncEventDomainService,
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
  ) {}

  /**
   * 동기화 이벤트 조회
   *
   * @param params 조회 파라미터
   * @returns 이벤트 목록과 요약 정보
   */
  async findSyncEvents(
    params: FindSyncEventsParams,
  ): Promise<SyncEventsResult> {
    const hours = params.hours ?? 24;
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    // 상태별 이벤트 조회
    let events: SyncEventEntity[] = [];

    if (params.status) {
      // 특정 상태만 조회
      events = await this.syncEventDomainService.상태별조회(params.status);
    } else {
      // 모든 상태 조회 (PENDING, QUEUED, PROCESSING, RETRYING, FAILED, DONE)
      const [pending, queued, processing, retrying, failed, done] = await Promise.all([
        this.syncEventDomainService.상태별조회(SyncEventStatus.PENDING),
        this.syncEventDomainService.상태별조회(SyncEventStatus.QUEUED),
        this.syncEventDomainService.상태별조회(SyncEventStatus.PROCESSING),
        this.syncEventDomainService.상태별조회(SyncEventStatus.RETRYING),
        this.syncEventDomainService.상태별조회(SyncEventStatus.FAILED),
        this.syncEventDomainService.상태별조회(SyncEventStatus.DONE),
      ]);
      events = [...pending, ...queued, ...processing, ...retrying, ...failed, ...done];
    }

    // 시간 범위 필터링
    events = events.filter((e) => e.createdAt >= cutoffDate);

    // 이벤트 타입 필터링
    if (params.eventType) {
      events = events.filter((e) => e.eventType === params.eventType);
    }

    // stuck 정보 추가
    const now = new Date();
    const enrichedEvents: EnrichedSyncEvent[] = events.map((event) => {
      const ageMs = now.getTime() - event.createdAt.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      const isStuckPending =
        event.status === SyncEventStatus.PENDING && ageHours >= STUCK_PENDING_HOURS;
      const isStuckProcessing =
        event.status === SyncEventStatus.PROCESSING && ageMs >= STUCK_PROCESSING_MS;

      return {
        ...event,
        isStuck: isStuckPending || isStuckProcessing,
        ageHours,
      } as EnrichedSyncEvent;
    });

    // 요약 정보 계산
    const summary = this.calculateSummary(enrichedEvents);

    // 페이징 적용
    // 정렬: 최신순 (생성일 내림차순)
    enrichedEvents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const paginatedEvents = enrichedEvents.slice(
      params.offset,
      params.offset + params.limit,
    );

    return {
      events: paginatedEvents,
      summary,
    };
  }

  /**
   * 상태별 이벤트 건수 조회 (DB 레벨 GROUP BY)
   */
  async countByStatus(): Promise<Record<string, number>> {
    return this.syncEventRepository.countByStatus();
  }

  /**
   * 필터 + 페이지네이션으로 대시보드 이벤트 조회 (raw, enrichment는 호출자에서 처리)
   */
  async findDashboardEvents(
    params: DashboardEventsParams,
  ): Promise<{ events: SyncEventEntity[]; total: number }> {
    return this.syncEventRepository.findWithFilters(params);
  }

  /**
   * stuck 상태 이벤트 수 조회
   * PENDING > 1시간 + PROCESSING > 30분
   */
  async getStuckCount(): Promise<number> {
    const [stuckPending, stuckProcessing] = await Promise.all([
      this.syncEventDomainService.상태별조회(SyncEventStatus.PENDING),
      this.syncEventDomainService.상태별조회(SyncEventStatus.PROCESSING),
    ]);

    const now = new Date();
    const pendingStuck = stuckPending.filter((e) => {
      const ageHours = (now.getTime() - e.createdAt.getTime()) / (1000 * 60 * 60);
      return ageHours >= STUCK_PENDING_HOURS;
    });
    const processingStuck = stuckProcessing.filter((e) => {
      const ageMs = now.getTime() - e.createdAt.getTime();
      return ageMs >= STUCK_PROCESSING_MS;
    });

    return pendingStuck.length + processingStuck.length;
  }

  /**
   * 파일 ID로 동기화 이벤트 히스토리 조회
   * @param fileId 파일 ID
   * @returns 해당 파일의 모든 동기화 이벤트 (최신순)
   */
  async findByFileId(fileId: string): Promise<EnrichedSyncEvent[]> {
    const events = await this.syncEventDomainService.파일아이디조회(fileId);
    return this.enrichEvents(events);
  }

  /**
   * 폴더 ID로 동기화 이벤트 히스토리 조회
   * @param folderId 폴더 ID
   * @returns 해당 폴더의 모든 동기화 이벤트 (최신순)
   */
  async findByFolderId(folderId: string): Promise<EnrichedSyncEvent[]> {
    const events = await this.syncEventDomainService.폴더아이디조회(folderId);
    return this.enrichEvents(events);
  }

  /**
   * 이벤트 목록에 stuck 정보 추가
   */
  private enrichEvents(events: SyncEventEntity[]): EnrichedSyncEvent[] {
    const now = new Date();
    return events.map((event) => {
      const ageMs = now.getTime() - event.createdAt.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      const isStuckPending =
        event.status === SyncEventStatus.PENDING && ageHours >= STUCK_PENDING_HOURS;
      const isStuckProcessing =
        event.status === SyncEventStatus.PROCESSING && ageMs >= STUCK_PROCESSING_MS;

      return {
        ...event,
        isStuck: isStuckPending || isStuckProcessing,
        ageHours,
      } as EnrichedSyncEvent;
    });
  }

  /**
   * 요약 정보 계산
   */
  private calculateSummary(events: EnrichedSyncEvent[]): SyncEventSummary {
    return {
      total: events.length,
      failed: events.filter((e) => e.status === SyncEventStatus.FAILED).length,
      pending: events.filter((e) => e.status === SyncEventStatus.PENDING).length,
      processing: events.filter((e) => e.status === SyncEventStatus.PROCESSING).length,
      done: events.filter((e) => e.status === SyncEventStatus.DONE).length,
      stuckPending: events.filter(
        (e) => e.isStuck && e.status === SyncEventStatus.PENDING,
      ).length,
      stuckProcessing: events.filter(
        (e) => e.isStuck && e.status === SyncEventStatus.PROCESSING,
      ).length,
    };
  }
}
