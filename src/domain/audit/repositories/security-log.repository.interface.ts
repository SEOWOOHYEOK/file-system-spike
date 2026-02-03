import { SecurityLog } from '../entities/security-log.entity';
import { SecurityEventType, Severity } from '../enums/security-event.enum';
import { PaginationOptions, PaginatedResult } from './audit-log.repository.interface';

/**
 * 보안 로그 필터 옵션
 */
export interface SecurityLogFilterOptions {
  eventType?: SecurityEventType;
  eventTypes?: SecurityEventType[];
  userId?: string;
  ipAddress?: string;
  severity?: Severity;
  severities?: Severity[];
  startDate?: Date;
  endDate?: Date;
}

/**
 * 보안 로그 리포지토리 인터페이스
 */
export interface ISecurityLogRepository {
  /**
   * 로그 저장
   */
  save(log: SecurityLog): Promise<SecurityLog>;

  /**
   * 다수 로그 배치 저장
   */
  saveMany(logs: SecurityLog[]): Promise<void>;

  /**
   * ID로 조회
   */
  findById(id: string): Promise<SecurityLog | null>;

  /**
   * 필터 조건으로 조회
   */
  findByFilter(
    filter: SecurityLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<SecurityLog>>;

  /**
   * 사용자별 최근 보안 로그 조회
   */
  findByUserId(userId: string, limit?: number): Promise<SecurityLog[]>;

  /**
   * IP별 로그인 실패 횟수
   */
  countLoginFailuresByIp(ipAddress: string, since: Date): Promise<number>;

  /**
   * 사용자별 로그인 실패 횟수
   */
  countLoginFailuresByUsername(
    usernameAttempted: string,
    since: Date,
  ): Promise<number>;
}

export const SECURITY_LOG_REPOSITORY = Symbol('ISecurityLogRepository');
