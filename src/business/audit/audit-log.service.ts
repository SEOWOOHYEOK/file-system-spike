import { Injectable } from '@nestjs/common';
import {
  AuditLog,
  CreateAuditLogParams,
} from '../../domain/audit/entities/audit-log.entity';
import { AuditLogDomainService } from '../../domain/audit/service/audit-log-domain.service';
import type {
  AuditLogFilterOptions,
  PaginationOptions,
  PaginatedResult,
} from '../../domain/audit/repositories/audit-log.repository.interface';
import { AuditAction } from '../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../domain/audit/enums/common.enum';
import type { PaginationParams, PaginatedResult as CommonPaginatedResult } from '../../common/types/pagination';
import { createPaginatedResult } from '../../common/types/pagination';
import { BufferedWriter } from './buffered-writer';

/**
 * AuditLogService
 *
 * 감사 로그를 비동기적으로 처리하고 배치로 저장
 * - BufferedWriter로 로그 버퍼링 (DB 부하 감소)
 * - 주기적 자동 플러시
 * - 앱 종료 시 남은 로그 저장
 */
@Injectable()
export class AuditLogService extends BufferedWriter<AuditLog> {
  constructor(
    private readonly auditLogDomainService: AuditLogDomainService,
  ) {
    super(AuditLogService.name, { maxSize: 100, flushIntervalMs: 5000 });
  }

  protected async persistBatch(items: AuditLog[]): Promise<void> {
    await this.auditLogDomainService.다중저장(items);
  }

  protected get entityName(): string {
    return 'audit logs';
  }

  // ──────────────────────────────────────────────
  //  기록 API
  // ──────────────────────────────────────────────

  /**
   * 감사 로그 기록 (비동기, 버퍼링)
   */
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      const log = AuditLog.create(params);
      await this.enqueue(log);
    } catch (error) {
      this.logger.error('Failed to create audit log', error);
    }
  }

  /**
   * 성공 로그 기록
   */
  async logSuccess(
    params: Omit<CreateAuditLogParams, 'result' | 'failReason'>,
  ): Promise<void> {
    const log = AuditLog.createSuccess(params);
    await this.enqueue(log);
  }

  /**
   * 실패 로그 기록
   */
  async logFailure(
    params: Omit<CreateAuditLogParams, 'result'> & { failReason: string },
  ): Promise<void> {
    const log = AuditLog.createFailure(params);
    await this.enqueue(log);
  }

  /**
   * 동기 로그 기록 (즉시 저장, 중요한 로그용)
   */
  async logImmediate(params: CreateAuditLogParams): Promise<AuditLog> {
    const log = AuditLog.create(params);
    return this.auditLogDomainService.저장(log);
  }

  // ──────────────────────────────────────────────
  //  조회 API
  // ──────────────────────────────────────────────

  /**
   * ID로 로그 조회
   */
  async findById(id: string): Promise<AuditLog | null> {
    return this.auditLogDomainService.조회(id);
  }

  /**
   * 필터 조건으로 로그 조회
   */
  async findByFilter(
    filter: AuditLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.auditLogDomainService.필터조회(filter, pagination);
  }

  /**
   * 사용자별 최근 로그 조회
   */
  async findByUserId(userId: string, limit?: number): Promise<AuditLog[]> {
    return this.auditLogDomainService.사용자별조회(userId, limit);
  }

  /**
   * 대상별 접근 이력 조회
   */
  async findByTarget(
    targetType: TargetType,
    targetId: string,
    limit?: number,
  ): Promise<AuditLog[]> {
    return this.auditLogDomainService.대상별조회(targetType, targetId, limit);
  }

  /**
   * 세션별 로그 조회
   */
  async findBySessionId(sessionId: string): Promise<AuditLog[]> {
    return this.auditLogDomainService.세션별조회(sessionId);
  }

  /**
   * 특정 기간 내 액션 수 카운트
   */
  async countByUserAndAction(
    userId: string,
    action: AuditAction,
    since: Date,
  ): Promise<number> {
    return this.auditLogDomainService.사용자액션카운트(userId, action, since);
  }

  /**
   * 특정 기간 내 다중 액션 수 카운트
   */
  async countByUserActions(
    userId: string,
    actions: AuditAction[],
    since: Date,
  ): Promise<number> {
    return this.auditLogDomainService.사용자액션들카운트(userId, actions, since);
  }

  /**
   * 사용자 파일/폴더 활동 내역 조회 (페이지네이션)
   *
   * @param userId 사용자 ID
   * @param allowedActions 허용된 파일/폴더 액션 목록 (기본값 전체)
   * @param filterActions 사용자가 선택한 필터 액션 (allowedActions의 부분집합)
   * @param pagination 페이지네이션 파라미터
   */
  async findUserFileActivities(
    userId: string,
    allowedActions: AuditAction[],
    filterActions: AuditAction[] | undefined,
    pagination: PaginationParams,
  ): Promise<CommonPaginatedResult<AuditLog>> {
    // 필터 액션이 있으면 허용 목록과 교집합, 없으면 전체 허용 목록 사용
    const actions = filterActions
      ? filterActions.filter((a) => allowedActions.includes(a))
      : allowedActions;

    const filter: AuditLogFilterOptions = {
      userId,
      actions,
    };

    const result = await this.auditLogDomainService.필터조회(filter, {
      page: pagination.page,
      limit: pagination.pageSize,
    });

    return createPaginatedResult(
      result.data,
      result.page,
      result.limit,
      result.total,
    );
  }
}
