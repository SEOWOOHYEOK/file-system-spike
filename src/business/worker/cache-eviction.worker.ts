/**
 * 캐시 Eviction Worker
 *
 * 캐시 용량이 임계값을 초과하면 LRU 정책에 따라 파일을 자동으로 제거합니다.
 * - 10분마다 실행 (환경변수로 조정 가능)
 * - NAS에 동기화 완료된 파일만 제거
 * - leaseCount > 0인 파일(다운로드 중)은 제거하지 않음
 *
 * 실제 캐시 관리 로직은 CacheManagementService에 위임합니다.
 * 이 워커는 @Cron 스케줄링 전용입니다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CacheManagementService } from '../admin/cache-management.service';
import type { EvictionResult, CacheStatus } from '../admin/cache-management.service';

@Injectable()
export class CacheEvictionWorker {
  private readonly logger = new Logger(CacheEvictionWorker.name);

  constructor(
    private readonly cacheManagementService: CacheManagementService,
  ) {}

  /**
   * 10분마다 캐시 Eviction 실행 scheduler
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runScheduledEviction(): Promise<void> {
    await this.runEviction();
  }

  /**
   * 캐시 Eviction 실행 (수동 호출 가능)
   * CacheManagementService에 위임
   */
  async runEviction(): Promise<EvictionResult> {
    return this.cacheManagementService.runEviction();
  }

  /**
   * 캐시 사용 현황 상세 조회 (Admin API용)
   * CacheManagementService에 위임
   */
  async getCacheStatus(): Promise<CacheStatus> {
    return this.cacheManagementService.getCacheStatus();
  }
}
