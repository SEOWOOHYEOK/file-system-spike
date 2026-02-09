/**
 * NAS 헬스 체크 이력 리포지토리 인터페이스 (포트)
 * Domain Layer에서 정의하며, Infrastructure Layer에서 구현합니다.
 */
import { NasHealthHistoryEntity } from '../entities/nas-health-history.entity';

/**
 * 리포지토리 토큰
 */
export const NAS_HEALTH_HISTORY_REPOSITORY = Symbol('NAS_HEALTH_HISTORY_REPOSITORY');

/**
 * NAS 헬스 체크 이력 리포지토리 인터페이스
 */
export interface INasHealthHistoryRepository {
  /**
   * 헬스 체크 이력 저장
   */
  save(entity: NasHealthHistoryEntity): Promise<NasHealthHistoryEntity>;

  /**
   * 최근 N시간 이력 조회
   * @param hours 시간 범위
   */
  findRecentByHours(hours: number): Promise<NasHealthHistoryEntity[]>;

  /**
   * 최신 이력 조회
   */
  findLatest(): Promise<NasHealthHistoryEntity | null>;

  /**
   * 보관 기간보다 오래된 이력 삭제
   * @param retentionDays 보관 기간 (일)
   * @returns 삭제된 레코드 수
   */
  deleteOlderThan(retentionDays: number): Promise<number>;
}
