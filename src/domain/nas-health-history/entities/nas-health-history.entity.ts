/**
 * NAS 헬스 체크 이력 도메인 엔티티
 * NAS의 주기적인 헬스 체크 결과를 저장합니다.
 *
 * DDD 관점: NasHealthHistory는 NAS 헬스 체크 이력의 Aggregate Root입니다.
 */

/**
 * NAS 헬스 상태
 */
export enum NasHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * NAS 헬스 체크 이력 엔티티
 */
export class NasHealthHistoryEntity {
  /** 이력 ID (UUID) */
  id: string;

  /** 헬스 상태 */
  status: NasHealthStatus;

  /** 응답 시간 (밀리초) */
  responseTimeMs: number;

  /** 전체 용량 (바이트) */
  totalBytes: number;

  /** 사용 중인 용량 (바이트) */
  usedBytes: number;

  /** 여유 용량 (바이트) */
  freeBytes: number;

  /** 에러 메시지 (정상이면 null) */
  error: string | null;

  /** 체크 일시 */
  checkedAt: Date;

  constructor(partial: Partial<NasHealthHistoryEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 헬스 상태가 정상인지 확인
   */
  isHealthy(): boolean {
    return this.status === NasHealthStatus.HEALTHY;
  }

  /**
   * 사용률 퍼센트 계산
   */
  get usagePercent(): number {
    if (!this.totalBytes || this.totalBytes === 0) return 0;
    return (this.usedBytes / this.totalBytes) * 100;
  }
}
