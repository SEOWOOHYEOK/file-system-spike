import { User } from '../entities/user.entity';

/**
 * User Repository 인터페이스
 *
 * User 도메인 엔티티의 영속성 관리를 위한 추상화
 */
export interface IUserRepository {
  /**
   * User 저장 (생성 또는 업데이트)
   */
  save(user: User): Promise<User>;

  /**
   * ID로 User 조회
   */
  findById(id: string): Promise<User | null>;

  /**
   * 전체 User 목록 조회
   */
  findAll(): Promise<User[]>;

  /**
   * 활성 User 목록 조회
   */
  findAllActive(): Promise<User[]>;

  /**
   * 여러 ID로 User 일괄 조회
   */
  findByIds(ids: string[]): Promise<User[]>;

  /**
   * User 삭제
   */
  delete(id: string): Promise<void>;

  /**
   * 여러 User 일괄 저장
   */
  saveMany(users: User[]): Promise<User[]>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
