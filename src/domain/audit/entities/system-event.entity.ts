import { v4 as uuidv4 } from 'uuid';
import { SystemEventType } from '../enums/system-event-type.enum';
import { SystemAction } from '../enums/system-action.enum';

/**
 * 심각도 레벨
 */
export type Severity = 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL';

/**
 * 시스템 이벤트 생성 파라미터
 *
 * SystemEvent.create() 팩토리 메서드에 전달되는 파라미터
 */
export interface CreateSystemEventParams {
  eventType: SystemEventType;
  traceId?: string;
  parentEventId?: string;
  actorName: string; // 'NasHealthCheckScheduler', 'SyncWorker' 등
  targetId?: string;
  targetName?: string;
  result: 'SUCCESS' | 'FAILURE';
  errorCode?: string;
  durationMs?: number;
  retryCount?: number;
  tags?: string[];
  description: string;
  systemAction?: SystemAction;
  systemActionDetail?: string;
  followUpScheduled?: boolean;
  followUpAt?: Date;
  component: string; // 'NasHealthCheck' | 'SyncWorker' | 'Scheduler'
  severity: Severity;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * SystemEvent 도메인 엔티티
 *
 * 시스템에서 발생하는 자동 이벤트를 기록
 * - NAS 상태 점검, 동기화 워커, 스케줄러 등
 *
 * 설계 원칙:
 * - 시스템 자동 작업의 모든 상태 변화 기록
 * - append-only (UPDATE/DELETE 금지, 무결성 보장)
 * - 풍부한 컨텍스트로 "무엇이, 언제, 어떻게, 왜" 발생했는지 기록
 *
 * 활용 예시:
 * - "NAS 상태가 언제 변경되었나?"
 * - "동기화 작업이 실패한 이유는?"
 * - "스케줄러가 정상적으로 실행되었나?"
 */
export class SystemEvent {
  readonly id: string;
  readonly eventSource: 'SYSTEM' = 'SYSTEM'; // 항상 고정
  readonly eventType: SystemEventType;
  readonly occurredAt: Date;
  readonly traceId?: string;
  readonly parentEventId?: string;
  readonly actorId: string = 'SYSTEM'; // 항상 고정
  readonly actorName: string;
  readonly targetId?: string;
  readonly targetName?: string;
  readonly result: 'SUCCESS' | 'FAILURE';
  readonly errorCode?: string;
  readonly durationMs?: number;
  readonly retryCount?: number;
  readonly tags?: string[];
  readonly description: string;
  readonly systemAction?: SystemAction;
  readonly systemActionDetail?: string;
  readonly followUpScheduled?: boolean;
  readonly followUpAt?: Date;
  readonly component: string;
  readonly severity: Severity;
  readonly previousState?: Record<string, unknown>;
  readonly newState?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;

  private constructor(props: Partial<SystemEvent> & { id: string }) {
    Object.assign(this, props);
  }

  /**
   * 시스템 이벤트 생성 팩토리 메서드
   *
   * @param params - 이벤트 생성에 필요한 파라미터
   * @returns 새로운 SystemEvent 인스턴스
   */
  static create(params: CreateSystemEventParams): SystemEvent {
    return new SystemEvent({
      id: uuidv4(),
      eventSource: 'SYSTEM',
      eventType: params.eventType,
      occurredAt: new Date(),
      traceId: params.traceId,
      parentEventId: params.parentEventId,
      actorId: 'SYSTEM',
      actorName: params.actorName,
      targetId: params.targetId,
      targetName: params.targetName,
      result: params.result,
      errorCode: params.errorCode,
      durationMs: params.durationMs,
      retryCount: params.retryCount,
      tags: params.tags,
      description: params.description,
      systemAction: params.systemAction,
      systemActionDetail: params.systemActionDetail,
      followUpScheduled: params.followUpScheduled,
      followUpAt: params.followUpAt,
      component: params.component,
      severity: params.severity,
      previousState: params.previousState,
      newState: params.newState,
      metadata: params.metadata,
    });
  }

  /**
   * 재구성 (DB에서 로드 시)
   *
   * @param props - DB에서 조회한 데이터 (id 필수)
   * @returns 재구성된 SystemEvent 인스턴스
   */
  static reconstitute(
    props: Partial<SystemEvent> & { id: string },
  ): SystemEvent {
    return new SystemEvent(props);
  }
}
