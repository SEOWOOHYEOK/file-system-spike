import { SecurityLog, SecurityLogDetails } from '../../../domain/audit/entities/security-log.entity';
import {
  SecurityEventType,
  Severity,
} from '../../../domain/audit/enums/security-event.enum';
import { UserType, ClientType } from '../../../domain/audit/enums/common.enum';
import { SecurityLogOrmEntity } from '../entities/security-log.orm-entity';

/**
 * SecurityLog 매퍼
 *
 * Domain Entity <-> ORM Entity 변환
 */
export class SecurityLogMapper {
  /**
   * ORM Entity -> Domain Entity
   */
  static toDomain(orm: SecurityLogOrmEntity): SecurityLog {
    return SecurityLog.reconstitute({
      id: orm.id,
      requestId: orm.requestId,
      sessionId: orm.sessionId || undefined,
      eventType: orm.eventType as SecurityEventType,
      severity: orm.severity as Severity,
      userId: orm.userId || undefined,
      userType: (orm.userType as UserType) || undefined,
      usernameAttempted: orm.usernameAttempted || undefined,
      ipAddress: orm.ipAddress,
      userAgent: orm.userAgent,
      clientType: (orm.clientType as ClientType) || ClientType.UNKNOWN,
      details: (orm.details as SecurityLogDetails) || undefined,
      createdAt: orm.createdAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity
   */
  static toOrm(domain: SecurityLog): Partial<SecurityLogOrmEntity> {
    return {
      id: domain.id,
      requestId: domain.requestId,
      sessionId: domain.sessionId || null,
      eventType: domain.eventType,
      severity: domain.severity,
      userId: domain.userId || null,
      userType: domain.userType || null,
      usernameAttempted: domain.usernameAttempted || null,
      ipAddress: domain.ipAddress,
      userAgent: domain.userAgent,
      clientType: domain.clientType || null,
      details: domain.details || null,
      createdAt: domain.createdAt,
    };
  }

  /**
   * ORM Entity 배열 -> Domain Entity 배열
   */
  static toDomainList(orms: SecurityLogOrmEntity[]): SecurityLog[] {
    return orms.map((orm) => this.toDomain(orm));
  }
}
