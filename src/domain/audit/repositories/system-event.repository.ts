import { SystemEvent } from '../entities/system-event.entity';
import { Severity } from '../entities/system-event.entity';

/**
 * 시스템 이벤트 리포지토리 인터페이스
 */
export interface ISystemEventRepository {
  /**
   * 이벤트 저장
   */
  save(event: SystemEvent): Promise<void>;

  /**
   * 다수 이벤트 배치 저장
   */
  saveBatch(events: SystemEvent[]): Promise<void>;

  /**
   * 시간 범위로 조회
   */
  findByTimeRange(
    from: Date,
    to: Date,
    limit?: number,
  ): Promise<SystemEvent[]>;

  /**
   * 컴포넌트별 조회
   */
  findByComponent(
    component: string,
    from?: Date,
    to?: Date,
  ): Promise<SystemEvent[]>;

  /**
   * 트레이스 ID로 조회
   */
  findByTraceId(traceId: string): Promise<SystemEvent[]>;

  /**
   * 대상 ID로 조회
   */
  findByTargetId(
    targetId: string,
    from?: Date,
    to?: Date,
  ): Promise<SystemEvent[]>;

  /**
   * 심각도별 조회
   */
  findBySeverity(
    severity: Severity,
    from?: Date,
    to?: Date,
  ): Promise<SystemEvent[]>;
}

export const SYSTEM_EVENT_REPOSITORY = Symbol('ISystemEventRepository');
