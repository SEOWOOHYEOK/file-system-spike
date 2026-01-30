import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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

/**
 * 로그 버퍼 설정
 */
interface LogBufferConfig {
  maxSize: number; // 최대 버퍼 크기
  flushIntervalMs: number; // 자동 플러시 간격 (밀리초)
}

const DEFAULT_BUFFER_CONFIG: LogBufferConfig = {
  maxSize: 100,
  flushIntervalMs: 5000, // 5초
};

/**
 * AuditLogService
 *
 * 감사 로그를 비동기적으로 처리하고 배치로 저장
 * - 로그 버퍼링으로 DB 부하 감소
 * - 주기적 자동 플러시
 * - 앱 종료 시 남은 로그 저장
 */
@Injectable()
export class AuditLogService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly buffer: AuditLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly config: LogBufferConfig;

  constructor(
    private readonly auditLogDomainService: AuditLogDomainService,
  ) {
    this.config = DEFAULT_BUFFER_CONFIG;
    this.startAutoFlush();
  }

  /**
   * 모듈 종료 시 남은 로그 저장
   */
  async onModuleDestroy(): Promise<void> {
    this.stopAutoFlush();
    await this.flush();
  }

  /**
   * 감사 로그 기록 (비동기, 버퍼링)
   */
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      const log = AuditLog.create(params);
      this.buffer.push(log);

      // 버퍼가 가득 차면 즉시 플러시
      if (this.buffer.length >= this.config.maxSize) {
        await this.flush();
      }
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
    this.buffer.push(log);

    if (this.buffer.length >= this.config.maxSize) {
      await this.flush();
    }
  }

  /**
   * 실패 로그 기록
   */
  async logFailure(
    params: Omit<CreateAuditLogParams, 'result'> & { failReason: string },
  ): Promise<void> {
    const log = AuditLog.createFailure(params);
    this.buffer.push(log);

    if (this.buffer.length >= this.config.maxSize) {
      await this.flush();
    }
  }

  /**
   * 동기 로그 기록 (즉시 저장, 중요한 로그용)
   */
  async logImmediate(params: CreateAuditLogParams): Promise<AuditLog> {
    const log = AuditLog.create(params);
    return this.auditLogDomainService.저장(log);
  }

  /**
   * 버퍼 플러시 (DB 저장)
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToSave = [...this.buffer];
    this.buffer.length = 0;

    try {
      await this.auditLogDomainService.다중저장(logsToSave);
      this.logger.debug(`Flushed ${logsToSave.length} audit logs`);
    } catch (error) {
      this.logger.error(`Failed to flush ${logsToSave.length} audit logs`, error);
      // 실패한 로그를 다시 버퍼에 추가 (재시도)
      this.buffer.push(...logsToSave);
    }
  }

  /**
   * 자동 플러시 시작
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.config.flushIntervalMs);
  }

  /**
   * 자동 플러시 중지
   */
  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

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
}
