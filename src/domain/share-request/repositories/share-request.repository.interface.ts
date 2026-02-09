import { ShareRequest } from '../entities/share-request.entity';
import { ShareRequestStatus } from '../type/share-request-status.enum';
import type { PaginationParams, PaginatedResult } from '../../../common/types/pagination';

/**
 * ShareRequest 필터 옵션
 */
export interface ShareRequestFilter {
  /** 상태 필터 */
  status?: ShareRequestStatus;
  /** 요청자 ID 필터 */
  requesterId?: string;
  /** 파일 ID 필터 */
  fileId?: string;
  /** 대상 사용자 ID 필터 */
  targetUserId?: string;
  /** 승인자 ID 필터 */
  approverId?: string;
  /** 요청일 시작 (requestedAt >= requestedAtFrom) */
  requestedAtFrom?: Date;
  /** 요청일 종료 (requestedAt <= requestedAtTo) */
  requestedAtTo?: Date;
}

/**
 * ShareRequest Repository 인터페이스
 *
 * ShareRequest 도메인 엔티티의 영속성 관리를 위한 추상화
 */
export interface IShareRequestRepository {
  /**
   * ShareRequest 저장 (생성 또는 업데이트)
   */
  save(shareRequest: ShareRequest): Promise<ShareRequest>;

  /**
   * ID로 ShareRequest 조회
   */
  findById(id: string): Promise<ShareRequest | null>;

  /**
   * 필터 조건으로 ShareRequest 목록 조회 (페이지네이션)
   */
  findByFilter(
    filter: ShareRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareRequest>>;

  /**
   * 여러 ID로 ShareRequest 일괄 조회
   */
  findByIds(ids: string[]): Promise<ShareRequest[]>;

  /**
   * 상태별 ShareRequest 개수 조회
   */
  countByStatus(): Promise<Record<ShareRequestStatus, number>>;

  /**
   * 파일과 대상 사용자로 대기 중인 요청 조회
   */
  findPendingByFileAndTarget(
    fileId: string,
    targetUserId: string,
  ): Promise<ShareRequest | null>;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const SHARE_REQUEST_REPOSITORY = Symbol('SHARE_REQUEST_REPOSITORY');
