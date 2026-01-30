import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import {
  SecurityLog,
  CreateSecurityLogParams,
} from '../../domain/audit/entities/security-log.entity';
import {
  type ISecurityLogRepository,
  SECURITY_LOG_REPOSITORY,
  SecurityLogFilterOptions,
} from '../../domain/audit/repositories/security-log.repository.interface';
import {
  PaginationOptions,
  PaginatedResult,
} from '../../domain/audit/repositories/audit-log.repository.interface';
import { UserType } from '../../domain/audit/enums/common.enum';

/**
 * SecurityLogService
 *
 * 보안 이벤트 로그를 비동기적으로 처리하고 배치로 저장
 */
@Injectable()
export class SecurityLogService implements OnModuleDestroy {
  private readonly logger = new Logger(SecurityLogService.name);
  private readonly buffer: SecurityLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly maxBufferSize = 50;
  private readonly flushIntervalMs = 3000; // 3초 (보안 로그는 더 빠르게)

  constructor(
    @Inject(SECURITY_LOG_REPOSITORY)
    private readonly securityLogRepository: ISecurityLogRepository,
  ) {
    this.startAutoFlush();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopAutoFlush();
    await this.flush();
  }

  /**
   * 보안 로그 기록 (비동기)
   */
  async log(params: CreateSecurityLogParams): Promise<void> {
    try {
      const log = SecurityLog.create(params);
      this.buffer.push(log);

      if (this.buffer.length >= this.maxBufferSize) {
        await this.flush();
      }
    } catch (error) {
      this.logger.error('Failed to create security log', error);
    }
  }

  /**
   * 로그인 성공 로그 기록
   */
  async logLoginSuccess(params: {
    requestId: string;
    sessionId?: string;
    userId: string;
    userType: UserType;
    ipAddress: string;
    userAgent: string;
    deviceFingerprint?: string;
  }): Promise<void> {
    const log = SecurityLog.createLoginSuccess(params);
    this.buffer.push(log);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 로그인 실패 로그 기록
   */
  async logLoginFailure(params: {
    requestId: string;
    usernameAttempted: string;
    ipAddress: string;
    userAgent: string;
    deviceFingerprint?: string;
    attemptCount: number;
    reason: string;
  }): Promise<void> {
    const log = SecurityLog.createLoginFailure(params);
    this.buffer.push(log);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 권한 거부 로그 기록
   */
  async logPermissionDenied(params: {
    requestId: string;
    sessionId?: string;
    userId: string;
    userType: UserType;
    ipAddress: string;
    userAgent: string;
    attemptedResource: string;
    requiredPermission: string;
  }): Promise<void> {
    const log = SecurityLog.createPermissionDenied(params);
    this.buffer.push(log);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 즉시 저장 (중요 보안 이벤트용)
   */
  async logImmediate(params: CreateSecurityLogParams): Promise<SecurityLog> {
    const log = SecurityLog.create(params);
    return this.securityLogRepository.save(log);
  }

  /**
   * 버퍼 플러시
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToSave = [...this.buffer];
    this.buffer.length = 0;

    try {
      await this.securityLogRepository.saveMany(logsToSave);
      this.logger.debug(`Flushed ${logsToSave.length} security logs`);
    } catch (error) {
      this.logger.error(`Failed to flush ${logsToSave.length} security logs`, error);
      this.buffer.push(...logsToSave);
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.flushIntervalMs);
  }

  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 필터 조건으로 조회
   */
  async findByFilter(
    filter: SecurityLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<SecurityLog>> {
    return this.securityLogRepository.findByFilter(filter, pagination);
  }

  /**
   * 사용자별 최근 보안 로그 조회
   */
  async findByUserId(userId: string, limit?: number): Promise<SecurityLog[]> {
    return this.securityLogRepository.findByUserId(userId, limit);
  }

  /**
   * IP별 로그인 실패 횟수
   */
  async countLoginFailuresByIp(ipAddress: string, since: Date): Promise<number> {
    return this.securityLogRepository.countLoginFailuresByIp(ipAddress, since);
  }

  /**
   * 사용자명별 로그인 실패 횟수
   */
  async countLoginFailuresByUsername(
    usernameAttempted: string,
    since: Date,
  ): Promise<number> {
    return this.securityLogRepository.countLoginFailuresByUsername(
      usernameAttempted,
      since,
    );
  }
}
