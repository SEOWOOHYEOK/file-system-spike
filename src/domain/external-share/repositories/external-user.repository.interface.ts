import { ExternalUser } from '../entities/external-user.entity';
import type { PaginationParams, PaginatedResult } from '../../../common/types/pagination';

/**
 * ExternalUser Repository 인터페이스
 *
 * ExternalUser 도메인 엔티티의 영속성 관리를 위한 추상화
 */
export interface IExternalUserRepository {
  /**
   * ExternalUser 저장 (생성 또는 업데이트)
   */
  save(user: ExternalUser): Promise<ExternalUser>;

  /**
   * ID로 ExternalUser 조회
   */
  findById(id: string): Promise<ExternalUser | null>;

  /**
   * Username으로 ExternalUser 조회 (로그인용)
   */
  findByUsername(username: string): Promise<ExternalUser | null>;

  /**
   * Email로 ExternalUser 조회
   */
  findByEmail(email: string): Promise<ExternalUser | null>;

  /**
   * 모든 ExternalUser 조회 (페이지네이션)
   */
  findAll(pagination: PaginationParams): Promise<PaginatedResult<ExternalUser>>;

  /**
   * 활성 사용자만 조회 (페이지네이션)
   */
  findAllActive(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>>;

  /**
   * ExternalUser 삭제
   */
  delete(id: string): Promise<void>;
}

export const EXTERNAL_USER_REPOSITORY = Symbol('EXTERNAL_USER_REPOSITORY');
