import { ShareAccessLog, AccessAction } from '../entities/share-access-log.entity';
import {
  PaginationParams,
  PaginatedResult,
} from './external-user.repository.interface';

/**
 * 접근 로그 필터
 */
export interface AccessLogFilter {
  publicShareId?: string;
  externalUserId?: string;
  action?: AccessAction;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
}

/**
 * ShareAccessLog Repository 인터페이스
 *
 * ShareAccessLog 도메인 엔티티의 영속성 관리를 위한 추상화
 */
export interface IShareAccessLogRepository {
  /**
   * ShareAccessLog 저장
   */
  save(log: ShareAccessLog): Promise<ShareAccessLog>;

  /**
   * ID로 ShareAccessLog 조회
   */
  findById(id: string): Promise<ShareAccessLog | null>;

  /**
   * 특정 공유의 접근 로그 조회 (페이지네이션)
   */
  findByShareId(
    publicShareId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareAccessLog>>;

  /**
   * 특정 외부 사용자의 접근 로그 조회 (페이지네이션)
   */
  findByExternalUserId(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareAccessLog>>;

  /**
   * 모든 접근 로그 조회 (관리자용, 페이지네이션 + 필터)
   */
  findAll(
    pagination: PaginationParams,
    filter?: AccessLogFilter,
  ): Promise<PaginatedResult<ShareAccessLog>>;
}

export const SHARE_ACCESS_LOG_REPOSITORY = Symbol('SHARE_ACCESS_LOG_REPOSITORY');
