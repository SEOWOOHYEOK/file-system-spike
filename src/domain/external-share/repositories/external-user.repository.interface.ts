import { ExternalUser } from '../entities/external-user.entity';

/**
 * 페이지네이션 요청 파라미터
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 페이지네이션 응답
 */
export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

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
