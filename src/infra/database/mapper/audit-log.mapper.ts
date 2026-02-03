import { AuditLog, AuditLogMetadata } from '../../../domain/audit/entities/audit-log.entity';
import {
  AuditAction,
  ActionCategory,
} from '../../../domain/audit/enums/audit-action.enum';
import {
  UserType,
  TargetType,
  LogResult,
  ClientType,
  Sensitivity,
} from '../../../domain/audit/enums/common.enum';
import { AuditLogOrmEntity } from '../entities/audit-log.orm-entity';

/**
 * AuditLog 매퍼
 *
 * Domain Entity <-> ORM Entity 변환
 */
export class AuditLogMapper {
  /**
   * ORM Entity -> Domain Entity
   */
  static toDomain(orm: AuditLogOrmEntity): AuditLog {
    return AuditLog.reconstitute({
      id: orm.id,
      requestId: orm.requestId,
      sessionId: orm.sessionId || undefined,
      traceId: orm.traceId || undefined,
      userId: orm.userId,
      userType: orm.userType as UserType,
      userName: orm.userName || undefined,
      userEmail: orm.userEmail || undefined,
      action: orm.action as AuditAction,
      actionCategory: orm.actionCategory as ActionCategory,
      targetType: orm.targetType as TargetType,
      targetId: orm.targetId,
      targetName: orm.targetName || undefined,
      targetPath: orm.targetPath || undefined,
      sensitivity: (orm.sensitivity as Sensitivity) || undefined,
      ownerId: orm.ownerId || undefined,
      ipAddress: orm.ipAddress,
      userAgent: orm.userAgent,
      clientType: (orm.clientType as ClientType) || ClientType.UNKNOWN,
      result: orm.result as LogResult,
      resultCode: orm.resultCode || undefined,
      failReason: orm.failReason || undefined,
      durationMs: orm.durationMs || undefined,
      metadata: (orm.metadata as AuditLogMetadata) || undefined,
      tags: orm.tags || undefined,
      createdAt: orm.createdAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity
   */
  static toOrm(domain: AuditLog): Partial<AuditLogOrmEntity> {
    return {
      id: domain.id,
      requestId: domain.requestId,
      sessionId: domain.sessionId || null,
      traceId: domain.traceId || null,
      userId: domain.userId,
      userType: domain.userType,
      userName: domain.userName || null,
      userEmail: domain.userEmail || null,
      action: domain.action,
      actionCategory: domain.actionCategory,
      targetType: domain.targetType,
      targetId: domain.targetId,
      targetName: domain.targetName || null,
      targetPath: domain.targetPath || null,
      sensitivity: domain.sensitivity || null,
      ownerId: domain.ownerId || null,
      ipAddress: domain.ipAddress,
      userAgent: domain.userAgent,
      clientType: domain.clientType || null,
      result: domain.result,
      resultCode: domain.resultCode || null,
      failReason: domain.failReason || null,
      durationMs: domain.durationMs || null,
      metadata: domain.metadata || null,
      tags: domain.tags || null,
      createdAt: domain.createdAt,
    };
  }

  /**
   * ORM Entity 배열 -> Domain Entity 배열
   */
  static toDomainList(orms: AuditLogOrmEntity[]): AuditLog[] {
    return orms.map((orm) => this.toDomain(orm));
  }
}
