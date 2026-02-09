import { SystemEvent } from '../../../domain/audit/entities/system-event.entity';
import { SystemEventType } from '../../../domain/audit/enums/system-event-type.enum';
import { SystemAction } from '../../../domain/audit/enums/system-action.enum';
import { SystemEventOrmEntity } from '../entities/system-event.orm-entity';

/**
 * SystemEvent 매퍼
 *
 * Domain Entity <-> ORM Entity 변환
 */
export class SystemEventMapper {
  /**
   * ORM Entity -> Domain Entity
   */
  static toDomain(orm: SystemEventOrmEntity): SystemEvent {
    return SystemEvent.reconstitute({
      id: orm.id,
      eventSource: 'SYSTEM',
      eventType: orm.eventType as SystemEventType,
      occurredAt: orm.occurredAt,
      traceId: orm.traceId || undefined,
      parentEventId: orm.parentEventId || undefined,
      actorId: 'SYSTEM',
      actorName: orm.actorName,
      targetId: orm.targetId || undefined,
      targetName: orm.targetName || undefined,
      result: orm.result as 'SUCCESS' | 'FAILURE',
      errorCode: orm.errorCode || undefined,
      durationMs: orm.durationMs || undefined,
      retryCount: orm.retryCount || undefined,
      tags: orm.tags || undefined,
      description: orm.description,
      systemAction: (orm.systemAction as SystemAction) || undefined,
      systemActionDetail: orm.systemActionDetail || undefined,
      followUpScheduled: orm.followUpScheduled || undefined,
      followUpAt: orm.followUpAt || undefined,
      component: orm.component,
      severity: orm.severity as 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL',
      previousState: orm.previousState || undefined,
      newState: orm.newState || undefined,
      metadata: orm.metadata || undefined,
    });
  }

  /**
   * Domain Entity -> ORM Entity
   */
  static toOrm(domain: SystemEvent): Partial<SystemEventOrmEntity> {
    return {
      id: domain.id,
      eventType: domain.eventType,
      occurredAt: domain.occurredAt,
      traceId: domain.traceId || null,
      parentEventId: domain.parentEventId || null,
      actorId: 'SYSTEM',
      actorName: domain.actorName,
      targetId: domain.targetId || null,
      targetName: domain.targetName || null,
      result: domain.result,
      errorCode: domain.errorCode || null,
      durationMs: domain.durationMs || null,
      retryCount: domain.retryCount || null,
      tags: domain.tags || null,
      description: domain.description,
      systemAction: domain.systemAction || null,
      systemActionDetail: domain.systemActionDetail || null,
      followUpScheduled: domain.followUpScheduled || null,
      followUpAt: domain.followUpAt || null,
      component: domain.component,
      severity: domain.severity,
      previousState: domain.previousState || null,
      newState: domain.newState || null,
      metadata: domain.metadata || null,
    };
  }

  /**
   * ORM Entity 배열 -> Domain Entity 배열
   */
  static toDomainList(orms: SystemEventOrmEntity[]): SystemEvent[] {
    return orms.map((orm) => this.toDomain(orm));
  }
}
