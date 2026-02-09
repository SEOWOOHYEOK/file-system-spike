/**
 * 시스템 설정 도메인 엔티티
 * 관리자가 설정 가능한 시스템 설정값을 관리합니다.
 *
 * DDD 관점: SystemConfig는 시스템 설정의 Aggregate Root입니다.
 */

/**
 * 시스템 설정 엔티티
 */
export class SystemConfigEntity {
  /** 설정 ID (UUID) */
  id: string;

  /** 설정 키 (예: "health.check.interval") */
  key: string;

  /** 설정 값 (문자열로 저장, 필요시 파싱) */
  value: string;

  /** 설정 설명 */
  description: string;

  /** 최종 수정 일시 */
  updatedAt: Date;

  /** 최종 수정자 ID */
  updatedBy: string;

  constructor(partial: Partial<SystemConfigEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 숫자 값으로 변환
   * @param defaultValue 파싱 실패 시 반환할 기본값
   * @returns 파싱된 숫자 값 또는 기본값
   */
  getNumberValue(defaultValue = 0): number {
    const parsed = Number(this.value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}
