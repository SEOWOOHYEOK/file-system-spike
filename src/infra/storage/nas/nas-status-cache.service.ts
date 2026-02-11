/**
 * NAS 상태 캐시 서비스
 *
 * NAS 스토리지의 가용 상태를 인메모리로 캐싱합니다.
 * - 스케줄러(Health Check): 모든 상태 전환 가능 (healthy/degraded/unhealthy)
 * - 워커(에러 감지): unhealthy로만 전환 가능 (상태 진동 방지)
 * - Guard/워커: 읽기 전용 조회
 *
 * 초기 상태는 'healthy'(낙관적)이며, 앱 시작 직후 첫 체크 전까지 요청을 허용합니다.
 */
import { Injectable, Logger } from '@nestjs/common';

export type NasStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface NasStatusSnapshot {
  status: NasStatus;
  lastCheckedAt: Date;
  lastError?: string;
}

@Injectable()
export class NasStatusCacheService {
  private readonly logger = new Logger(NasStatusCacheService.name);

  private status: NasStatus = 'healthy';
  private lastCheckedAt: Date = new Date(0);
  private lastError?: string;

  /**
   * 스케줄러 전용 - Health Check 결과로 상태 갱신
   * 모든 상태 전환이 가능합니다.
   */
  updateFromHealthCheck(result: { status: string; error?: string }): void {
    const previous = this.status;
    this.status = this.normalizeStatus(result.status);
    this.lastCheckedAt = new Date();
    this.lastError = result.error;

    if (previous !== this.status) {
      this.logger.warn(
        `NAS 상태 변경: ${previous} → ${this.status}` +
          (result.error ? ` (원인: ${result.error})` : ''),
      );
    }
  }

  /**
   * 워커 전용 - NAS 연결 에러 발생 시 unhealthy로 전환
   * unhealthy로만 전환 가능하며, healthy/degraded로의 복구는 스케줄러만 할 수 있습니다.
   */
  markUnhealthy(error: string): void {
    if (this.status === 'unhealthy') return;

    const previous = this.status;
    this.status = 'unhealthy';
    this.lastCheckedAt = new Date();
    this.lastError = error;

    this.logger.error(
      `NAS 상태 강제 전환: ${previous} → unhealthy (워커 에러 감지: ${error})`,
    );
  }

  /**
   * NAS가 사용 가능한지 확인
   * unhealthy이면 false를 반환합니다.
   * degraded는 느리더라도 연결은 되므로 true를 반환합니다.
   */
  isAvailable(): boolean {
    return this.status !== 'unhealthy';
  }

  /**
   * 진단용 전체 상태 반환
   */
  getStatus(): NasStatusSnapshot {
    return {
      status: this.status,
      lastCheckedAt: this.lastCheckedAt,
      lastError: this.lastError,
    };
  }

  private normalizeStatus(status: string): NasStatus {
    switch (status) {
      case 'healthy':
        return 'healthy';
      case 'degraded':
        return 'degraded';
      case 'unhealthy':
        return 'unhealthy';
      default:
        this.logger.warn(`알 수 없는 NAS 상태: ${status}, unhealthy로 처리`);
        return 'unhealthy';
    }
  }
}
