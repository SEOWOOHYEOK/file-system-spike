import { EventSource } from '../../../domain/audit/enums/event-source.enum';

/**
 * 시간 범위 조회 쿼리
 */
export interface TimeRangeQuery {
  from: Date;
  to: Date;
  eventSources?: EventSource[]; // filter by source
  severity?: string; // filter by severity
  result?: 'SUCCESS' | 'FAILURE'; // filter by result
  errorCode?: string; // filter by error code
  page: number;
  size: number;
}

/**
 * 파일 중심 조회 쿼리
 */
export interface FileQuery {
  fileId: string;
  from?: Date;
  to?: Date;
  page: number;
  size: number;
}

/**
 * 사용자 중심 조회 쿼리
 */
export interface ActorQuery {
  actorId: string;
  from?: Date;
  to?: Date;
  page: number;
  size: number;
}

/**
 * 관찰 가능성 이벤트 DTO
 *
 * 세 가지 이벤트 소스(AuditLog, FileHistory, SystemEvent)를 통합한 단일 형식
 */
export interface ObservabilityEventDto {
  id: string;
  eventSource: EventSource;
  eventType: string;
  occurredAt: Date;
  requestId?: string;
  traceId?: string;
  parentEventId?: string;
  actorId: string;
  actorName?: string;
  targetId?: string;
  targetName?: string;
  result: 'SUCCESS' | 'FAILURE';
  errorCode?: string;
  severity?: string;
  durationMs?: number;
  httpMethod?: string;
  apiEndpoint?: string;
  responseStatusCode?: number;
  systemAction?: string;
  systemActionDetail?: string;
  followUpScheduled?: boolean;
  followUpAt?: Date;
  retryCount?: number;
  tags?: string[];
  description: string;
}

/**
 * 통합 타임라인 응답
 */
export interface UnifiedTimeline {
  events: ObservabilityEventDto[];
  summary: {
    total: number;
    bySource: Record<EventSource, number>;
    byResult: {
      SUCCESS: number;
      FAILURE: number;
    };
    bySeverity?: Record<string, number>;
    timeRange: {
      earliest: Date | null;
      latest: Date | null;
    };
  };
  page: {
    current: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}
