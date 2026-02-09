/**
 * 시스템 설정 리포지토리 인터페이스 (포트)
 * Domain Layer에서 정의하며, Infrastructure Layer에서 구현합니다.
 */
import { SystemConfigEntity } from '../entities/system-config.entity';

/**
 * 리포지토리 토큰
 */
export const SYSTEM_CONFIG_REPOSITORY = Symbol('SYSTEM_CONFIG_REPOSITORY');

/**
 * 시스템 설정 리포지토리 인터페이스
 */
export interface ISystemConfigRepository {
  /**
   * 키로 설정 조회
   */
  findByKey(key: string): Promise<SystemConfigEntity | null>;

  /**
   * 전체 설정 조회
   */
  findAll(): Promise<SystemConfigEntity[]>;

  /**
   * 키 접두사로 설정 목록 조회
   * @param prefix 키 접두사 (예: "health.check")
   */
  findByKeyPrefix(prefix: string): Promise<SystemConfigEntity[]>;

  /**
   * 설정 저장 (생성 또는 수정)
   */
  save(entity: SystemConfigEntity): Promise<SystemConfigEntity>;
}
