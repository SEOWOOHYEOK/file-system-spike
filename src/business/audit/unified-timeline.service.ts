import { Injectable, Inject } from '@nestjs/common';
import { AuditLog } from '../../domain/audit/entities/audit-log.entity';
import { FileHistory } from '../../domain/audit/entities/file-history.entity';
import { SystemEvent } from '../../domain/audit/entities/system-event.entity';
import { AuditLogDomainService } from '../../domain/audit/service/audit-log-domain.service';
import { FileHistoryDomainService } from '../../domain/audit/service/file-history-domain.service';
import { type ISystemEventRepository, SYSTEM_EVENT_REPOSITORY } from '../../domain/audit/repositories/system-event.repository';
import { EventSource } from '../../domain/audit/enums/event-source.enum';
import { LogResult, TargetType } from '../../domain/audit/enums/common.enum';
import {
  TimeRangeQuery,
  FileQuery,
  ActorQuery,
  ObservabilityEventDto,
  UnifiedTimeline,
} from './types/unified-timeline.types';

/**
 * UnifiedTimelineService
 *
 * 세 가지 이벤트 소스(AuditLog, FileHistory, SystemEvent)를 통합하여
 * 단일 타임라인으로 제공하는 서비스
 *
 * 설계 원칙:
 * - Application-Level Merge: DB 뷰나 UNION 쿼리 대신 애플리케이션 레벨에서 병합
 * - 병렬 쿼리: Promise.all로 각 테이블을 독립적으로 조회
 * - 메모리 정렬 및 페이지네이션: 모든 결과를 메모리에서 정렬 후 페이지네이션
 */
@Injectable()
export class UnifiedTimelineService {
  constructor(
    private readonly auditLogDomainService: AuditLogDomainService,
    private readonly fileHistoryDomainService: FileHistoryDomainService,
    @Inject(SYSTEM_EVENT_REPOSITORY)
    private readonly systemEventRepository: ISystemEventRepository,
  ) {}

  /**
   * 시간 범위 조회 — "이 시간대에 무슨 일이 있었나?"
   */
  async getByTimeRange(params: TimeRangeQuery): Promise<UnifiedTimeline> {
    const { from, to, eventSources, severity, result, errorCode, page, size } = params;

    // 병렬로 각 테이블 조회
    const [auditLogsResult, fileHistoriesResult, systemEvents] = await Promise.all([
      // AuditLog 조회 (필터 적용)
      this.auditLogDomainService.필터조회(
        {
          startDate: from,
          endDate: to,
          result: result === 'SUCCESS' ? LogResult.SUCCESS : result === 'FAILURE' ? LogResult.FAIL : undefined,
        },
        { page: 1, limit: 10000 }, // 큰 limit으로 모든 결과 가져오기 (메모리에서 페이지네이션)
      ),
      // FileHistory 조회
      this.fileHistoryDomainService.필터조회(
        {
          startDate: from,
          endDate: to,
        },
        { page: 1, limit: 10000 },
      ),
      // SystemEvent 조회
      this.systemEventRepository.findByTimeRange(from, to, 10000),
    ]);

    // 모든 이벤트를 DTO로 변환
    const allEvents: ObservabilityEventDto[] = [
      ...auditLogsResult.data.map((log) => this.mapAuditLogToDto(log)),
      ...fileHistoriesResult.data.map((history) => this.mapFileHistoryToDto(history)),
      ...systemEvents.map((event) => this.mapSystemEventToDto(event)),
    ];

    // 필터 적용
    let filteredEvents = allEvents;

    // eventSources 필터
    if (eventSources && eventSources.length > 0) {
      filteredEvents = filteredEvents.filter((e) => eventSources.includes(e.eventSource));
    }

    // severity 필터
    if (severity) {
      filteredEvents = filteredEvents.filter((e) => e.severity === severity);
    }

    // result 필터 (이미 쿼리에서 적용했지만, SystemEvent는 별도로 필터링 필요)
    if (result) {
      filteredEvents = filteredEvents.filter((e) => e.result === result);
    }

    // errorCode 필터
    if (errorCode) {
      filteredEvents = filteredEvents.filter((e) => e.errorCode === errorCode);
    }

    // 시간순 정렬 (DESC)
    filteredEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    // 페이지네이션
    const offset = (page - 1) * size;
    const paginatedEvents = filteredEvents.slice(offset, offset + size);

    // 요약 정보 생성
    const summary = this.buildSummary(filteredEvents);

    return {
      events: paginatedEvents,
      summary,
      page: {
        current: page,
        size,
        totalElements: filteredEvents.length,
        totalPages: Math.ceil(filteredEvents.length / size),
      },
    };
  }

  /**
   * 파일 중심 조회 — "이 파일에 무슨 일이 일어났나?"
   */
  async getByFileId(params: FileQuery): Promise<UnifiedTimeline> {
    const { fileId, from, to, page, size } = params;

    // 병렬로 각 테이블 조회
    const [auditLogsResult, fileHistoriesResult, systemEvents] = await Promise.all([
      // AuditLog: 파일 관련 액션만 조회
      this.auditLogDomainService.필터조회(
        {
          targetType: TargetType.FILE,
          targetId: fileId,
          startDate: from,
          endDate: to,
        },
        { page: 1, limit: 10000 },
      ),
      // FileHistory: 해당 파일의 이력만 조회
      this.fileHistoryDomainService.필터조회(
        {
          fileId,
          startDate: from,
          endDate: to,
        },
        { page: 1, limit: 10000 },
      ),
      // SystemEvent: targetId가 fileId인 이벤트만 조회
      from && to
        ? this.systemEventRepository.findByTargetId(fileId, from, to)
        : this.systemEventRepository.findByTargetId(fileId),
    ]);

    // 모든 이벤트를 DTO로 변환
    const allEvents: ObservabilityEventDto[] = [
      ...auditLogsResult.data.map((log) => this.mapAuditLogToDto(log)),
      ...fileHistoriesResult.data.map((history) => this.mapFileHistoryToDto(history)),
      ...systemEvents.map((event) => this.mapSystemEventToDto(event)),
    ];

    // 시간순 정렬 (DESC)
    allEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    // 페이지네이션
    const offset = (page - 1) * size;
    const paginatedEvents = allEvents.slice(offset, offset + size);

    // 요약 정보 생성
    const summary = this.buildSummary(allEvents);

    return {
      events: paginatedEvents,
      summary,
      page: {
        current: page,
        size,
        totalElements: allEvents.length,
        totalPages: Math.ceil(allEvents.length / size),
      },
    };
  }

  /**
   * 사용자 중심 조회 — "이 사용자가 무엇을 했나?"
   */
  async getByActorId(params: ActorQuery): Promise<UnifiedTimeline> {
    const { actorId, from, to, page, size } = params;

    // 병렬로 각 테이블 조회
    const [auditLogsResult, fileHistoriesResult, systemEvents] = await Promise.all([
      // AuditLog: 해당 사용자의 로그만 조회
      this.auditLogDomainService.필터조회(
        {
          userId: actorId,
          startDate: from,
          endDate: to,
        },
        { page: 1, limit: 10000 },
      ),
      // FileHistory: 해당 사용자가 변경한 이력만 조회
      this.fileHistoryDomainService.필터조회(
        {
          changedBy: actorId,
          startDate: from,
          endDate: to,
        },
        { page: 1, limit: 10000 },
      ),
      // SystemEvent: actorId가 'SYSTEM'인 경우만 조회 (일반 사용자는 시스템 이벤트를 생성하지 않음)
      actorId === 'SYSTEM'
        ? from && to
          ? this.systemEventRepository.findByTimeRange(from, to, 10000)
          : Promise.resolve([])
        : Promise.resolve([]),
    ]);

    // 모든 이벤트를 DTO로 변환
    const allEvents: ObservabilityEventDto[] = [
      ...auditLogsResult.data.map((log) => this.mapAuditLogToDto(log)),
      ...fileHistoriesResult.data.map((history) => this.mapFileHistoryToDto(history)),
      ...systemEvents.map((event) => this.mapSystemEventToDto(event)),
    ];

    // 시간순 정렬 (DESC)
    allEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    // 페이지네이션
    const offset = (page - 1) * size;
    const paginatedEvents = allEvents.slice(offset, offset + size);

    // 요약 정보 생성
    const summary = this.buildSummary(allEvents);

    return {
      events: paginatedEvents,
      summary,
      page: {
        current: page,
        size,
        totalElements: allEvents.length,
        totalPages: Math.ceil(allEvents.length / size),
      },
    };
  }

  /**
   * 요청 추적 — "이 HTTP 요청이 어떤 변화를 일으켰나?"
   */
  async getByRequestId(requestId: string): Promise<UnifiedTimeline> {
    // requestId는 AuditLog와 FileHistory에만 있음
    // 시간 범위를 넓게 설정하여 조회 후 필터링
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 최근 7일

    const [auditLogsResult, fileHistoriesResult] = await Promise.all([
      this.auditLogDomainService.필터조회(
        {
          startDate: from,
          endDate: now,
        },
        { page: 1, limit: 10000 },
      ),
      this.fileHistoryDomainService.필터조회(
        {
          startDate: from,
          endDate: now,
        },
        { page: 1, limit: 10000 },
      ),
    ]);

    // requestId로 필터링
    const auditLogs = auditLogsResult.data.filter((log) => log.requestId === requestId);
    const fileHistories = fileHistoriesResult.data.filter(
      (history) => history.requestId === requestId,
    );

    // 모든 이벤트를 DTO로 변환
    const allEvents: ObservabilityEventDto[] = [
      ...auditLogs.map((log) => this.mapAuditLogToDto(log)),
      ...fileHistories.map((history) => this.mapFileHistoryToDto(history)),
    ];

    // 시간순 정렬 (DESC)
    allEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    // 요약 정보 생성
    const summary = this.buildSummary(allEvents);

    return {
      events: allEvents,
      summary,
      page: {
        current: 1,
        size: allEvents.length,
        totalElements: allEvents.length,
        totalPages: 1,
      },
    };
  }

  /**
   * 트레이스 추적 — "이 작업의 전체 과정은?"
   */
  async getByTraceId(traceId: string): Promise<UnifiedTimeline> {
    // traceId는 세 테이블 모두에 있음
    const [auditLogsResult, fileHistoriesResult, systemEvents] = await Promise.all([
      // AuditLog: 시간 범위를 넓게 설정하여 조회 후 필터링
      this.auditLogDomainService.필터조회(
        {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 최근 30일
          endDate: new Date(),
        },
        { page: 1, limit: 10000 },
      ),
      // FileHistory: 시간 범위를 넓게 설정하여 조회 후 필터링
      this.fileHistoryDomainService.필터조회(
        {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
        },
        { page: 1, limit: 10000 },
      ),
      // SystemEvent: findByTraceId 메서드 사용
      this.systemEventRepository.findByTraceId(traceId),
    ]);

    // traceId로 필터링
    const auditLogs = auditLogsResult.data.filter((log) => log.traceId === traceId);
    const fileHistories = fileHistoriesResult.data.filter(
      (history) => history.traceId === traceId,
    );

    // 모든 이벤트를 DTO로 변환
    const allEvents: ObservabilityEventDto[] = [
      ...auditLogs.map((log) => this.mapAuditLogToDto(log)),
      ...fileHistories.map((history) => this.mapFileHistoryToDto(history)),
      ...systemEvents.map((event) => this.mapSystemEventToDto(event)),
    ];

    // 시간순 정렬 (DESC)
    allEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    // 요약 정보 생성
    const summary = this.buildSummary(allEvents);

    return {
      events: allEvents,
      summary,
      page: {
        current: 1,
        size: allEvents.length,
        totalElements: allEvents.length,
        totalPages: 1,
      },
    };
  }

  /**
   * 인과관계 추적 — "이 이벤트의 원인 체인은?"
   */
  async getEventChain(eventId: string): Promise<ObservabilityEventDto[]> {
    // 먼저 이벤트를 찾음
    const [auditLog, fileHistory, systemEvent] = await Promise.all([
      this.auditLogDomainService.조회(eventId),
      this.fileHistoryDomainService.조회(eventId),
      Promise.resolve(null), // SystemEvent는 ID로 조회하는 메서드가 없음 (필요시 추가)
    ]);

    let currentEvent: ObservabilityEventDto | null = null;
    if (auditLog) {
      currentEvent = this.mapAuditLogToDto(auditLog);
    } else if (fileHistory) {
      currentEvent = this.mapFileHistoryToDto(fileHistory);
    }

    if (!currentEvent) {
      return [];
    }

    // parentEventId를 따라 체인을 구성
    const chain: ObservabilityEventDto[] = [currentEvent];
    let parentId = currentEvent.parentEventId;

    // 최대 10단계까지 추적 (무한 루프 방지)
    let depth = 0;
    while (parentId && depth < 10) {
      const [parentAuditLog, parentFileHistory] = await Promise.all([
        this.auditLogDomainService.조회(parentId),
        this.fileHistoryDomainService.조회(parentId),
      ]);

      let parentEvent: ObservabilityEventDto | null = null;
      if (parentAuditLog) {
        parentEvent = this.mapAuditLogToDto(parentAuditLog);
      } else if (parentFileHistory) {
        parentEvent = this.mapFileHistoryToDto(parentFileHistory);
      }

      if (!parentEvent) {
        break;
      }

      chain.unshift(parentEvent); // 앞에 추가 (시간순)
      parentId = parentEvent.parentEventId;
      depth++;
    }

    return chain;
  }

  /**
   * AuditLog를 ObservabilityEventDto로 변환
   */
  private mapAuditLogToDto(log: AuditLog): ObservabilityEventDto {
    return {
      id: log.id,
      eventSource: EventSource.AUDIT,
      eventType: log.action,
      occurredAt: log.createdAt,
      requestId: log.requestId,
      traceId: log.traceId,
      parentEventId: log.parentEventId,
      actorId: log.userId,
      actorName: log.userName,
      targetId: log.targetId,
      targetName: log.targetName,
      result: log.result === LogResult.SUCCESS ? 'SUCCESS' : 'FAILURE',
      errorCode: log.errorCode,
      severity: log.severity,
      durationMs: log.durationMs,
      httpMethod: log.httpMethod,
      apiEndpoint: log.apiEndpoint,
      responseStatusCode: log.responseStatusCode,
      systemAction: log.systemAction,
      systemActionDetail: log.systemActionDetail,
      followUpScheduled: log.followUpScheduled,
      followUpAt: log.followUpAt,
      retryCount: log.retryCount,
      tags: log.tags,
      description: log.description || '',
    };
  }

  /**
   * FileHistory를 ObservabilityEventDto로 변환
   */
  private mapFileHistoryToDto(history: FileHistory): ObservabilityEventDto {
    return {
      id: history.id,
      eventSource: EventSource.FILE_CHANGE,
      eventType: history.changeType,
      occurredAt: history.createdAt,
      requestId: history.requestId,
      traceId: history.traceId,
      parentEventId: history.parentEventId,
      actorId: history.changedBy,
      actorName: undefined, // FileHistory에는 사용자 이름이 없음
      targetId: history.fileId,
      targetName: history.newState?.name || history.previousState?.name,
      result: 'SUCCESS', // FileHistory는 항상 성공 (실패한 변경은 기록되지 않음)
      errorCode: history.errorCode,
      severity: undefined, // FileHistory에는 severity가 없음
      durationMs: undefined,
      httpMethod: history.httpMethod,
      apiEndpoint: history.apiEndpoint,
      responseStatusCode: undefined,
      systemAction: undefined,
      systemActionDetail: undefined,
      followUpScheduled: undefined,
      followUpAt: undefined,
      retryCount: history.retryCount,
      tags: history.tags,
      description: history.description || history.changeSummary || '',
    };
  }

  /**
   * SystemEvent를 ObservabilityEventDto로 변환
   */
  private mapSystemEventToDto(event: SystemEvent): ObservabilityEventDto {
    return {
      id: event.id,
      eventSource: EventSource.SYSTEM,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      requestId: undefined, // SystemEvent에는 requestId가 없음
      traceId: event.traceId,
      parentEventId: event.parentEventId,
      actorId: event.actorId,
      actorName: event.actorName,
      targetId: event.targetId,
      targetName: event.targetName,
      result: event.result,
      errorCode: event.errorCode,
      severity: event.severity,
      durationMs: event.durationMs,
      httpMethod: undefined,
      apiEndpoint: undefined,
      responseStatusCode: undefined,
      systemAction: event.systemAction,
      systemActionDetail: event.systemActionDetail,
      followUpScheduled: event.followUpScheduled,
      followUpAt: event.followUpAt,
      retryCount: event.retryCount,
      tags: event.tags,
      description: event.description,
    };
  }

  /**
   * 요약 정보 생성
   */
  private buildSummary(events: ObservabilityEventDto[]): UnifiedTimeline['summary'] {
    const bySource: Record<EventSource, number> = {
      [EventSource.AUDIT]: 0,
      [EventSource.FILE_CHANGE]: 0,
      [EventSource.SYSTEM]: 0,
    };

    const byResult = {
      SUCCESS: 0,
      FAILURE: 0,
    };

    const bySeverity: Record<string, number> = {};

    let earliest: Date | null = null;
    let latest: Date | null = null;

    for (const event of events) {
      // 소스별 카운트
      bySource[event.eventSource]++;

      // 결과별 카운트
      byResult[event.result]++;

      // 심각도별 카운트
      if (event.severity) {
        bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      }

      // 시간 범위
      if (!earliest || event.occurredAt < earliest) {
        earliest = event.occurredAt;
      }
      if (!latest || event.occurredAt > latest) {
        latest = event.occurredAt;
      }
    }

    return {
      total: events.length,
      bySource,
      byResult,
      bySeverity: Object.keys(bySeverity).length > 0 ? bySeverity : undefined,
      timeRange: {
        earliest,
        latest,
      },
    };
  }
}
