import { AuditLog } from '../entities/audit-log.entity';
import { AuditAction } from '../enums/audit-action.enum';
import { LogResult, TargetType, UserType } from '../enums/common.enum';

/**
 * 감사 로그 필터 옵션
 */
export interface AuditLogFilterOptions {
  userId?: string;
  userType?: UserType;
  action?: AuditAction;
  actions?: AuditAction[];
  targetType?: TargetType;
  targetId?: string;
  result?: LogResult;
  ipAddress?: string;
  deviceFingerprint?: string;
  sessionId?: string;
  sensitivity?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 페이지네이션 옵션
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * 페이지네이션 결과
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 감사 로그 리포지토리 인터페이스
 */
export interface IAuditLogRepository {
  /**
   * 로그 저장
   */
  save(log: AuditLog): Promise<AuditLog>;

  /**
   * 다수 로그 배치 저장
   */
  saveMany(logs: AuditLog[]): Promise<void>;

  /**
   * ID로 조회
   */
  findById(id: string): Promise<AuditLog | null>;

  /**
   * 필터 조건으로 조회
   */
  findByFilter(
    filter: AuditLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<AuditLog>>;

  /**
   * 사용자별 최근 로그 조회
   */
  findByUserId(
    userId: string,
    limit?: number,
  ): Promise<AuditLog[]>;

  /**
   * 대상별 접근 이력 조회
   */
  findByTarget(
    targetType: TargetType,
    targetId: string,
    limit?: number,
  ): Promise<AuditLog[]>;

  /**
   * 세션별 로그 조회
   */
  findBySessionId(sessionId: string): Promise<AuditLog[]>;

  /**
   * 특정 기간 내 액션 수 카운트
   */
  countByUserAndAction(
    userId: string,
    action: AuditAction,
    since: Date,
  ): Promise<number>;

  /**
   * 특정 기간 내 사용자별 액션 수 카운트
   */
  countByUserActions(
    userId: string,
    actions: AuditAction[],
    since: Date,
  ): Promise<number>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('IAuditLogRepository');
