import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG_REPOSITORY } from '../repositories/audit-log.repository.interface';
import type {
  AuditLogFilterOptions,
  IAuditLogRepository,
  PaginatedResult,
  PaginationOptions,
} from '../repositories/audit-log.repository.interface';
import type { AuditLog } from '../entities/audit-log.entity';
import type { AuditAction } from '../enums/audit-action.enum';
import type { TargetType } from '../enums/common.enum';

@Injectable()
export class AuditLogDomainService {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repository: IAuditLogRepository,
  ) {}

  async 저장(log: AuditLog): Promise<AuditLog> {
    return this.repository.save(log);
  }

  async 다중저장(logs: AuditLog[]): Promise<void> {
    return this.repository.saveMany(logs);
  }

  async 조회(id: string): Promise<AuditLog | null> {
    return this.repository.findById(id);
  }

  async 필터조회(
    filter: AuditLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.repository.findByFilter(filter, pagination);
  }

  async 사용자별조회(userId: string, limit?: number): Promise<AuditLog[]> {
    return this.repository.findByUserId(userId, limit);
  }

  async 대상별조회(
    targetType: TargetType,
    targetId: string,
    limit?: number,
  ): Promise<AuditLog[]> {
    return this.repository.findByTarget(targetType, targetId, limit);
  }

  async 세션별조회(sessionId: string): Promise<AuditLog[]> {
    return this.repository.findBySessionId(sessionId);
  }

  async 사용자액션카운트(
    userId: string,
    action: AuditAction,
    since: Date,
  ): Promise<number> {
    return this.repository.countByUserAndAction(userId, action, since);
  }

  async 사용자액션들카운트(
    userId: string,
    actions: AuditAction[],
    since: Date,
  ): Promise<number> {
    return this.repository.countByUserActions(userId, actions, since);
  }
}
