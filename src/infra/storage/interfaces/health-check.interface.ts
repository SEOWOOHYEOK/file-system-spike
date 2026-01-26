/**
 * 스토리지 헬스체크 인터페이스
 */

export enum StorageStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

export interface StorageHealth {
  status: StorageStatus;
  lastCheck: Date | null;
  message?: string;
  responseTime?: number;
}

export interface IHealthCheckable {
  /**
   * 현재 상태가 정상인지 확인 (캐시된 결과)
   */
  isHealthy(): boolean;

  /**
   * 현재 헬스 상태 조회 (캐시된 결과)
   */
  getHealth(): StorageHealth;

  /**
   * 헬스체크 수행 (실제 체크)
   */
  checkHealth(): Promise<StorageHealth>;

  /**
   * 주기적 헬스체크 시작
   */
  startHealthCheck(intervalMs: number): void;

  /**
   * 주기적 헬스체크 중지
   */
  stopHealthCheck(): void;
}
