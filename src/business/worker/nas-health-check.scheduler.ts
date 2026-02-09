/**
 * NAS 헬스체크 Cron 스케줄러
 *
 * 1분마다 실행되어 관리자 설정 주기에 따라 헬스체크를 수행합니다.
 * 주기 설정은 DB(system_configs)에서 읽어오므로 서버 재시작 없이 변경됩니다.
 *
 * 이력 정리는 매일 자정에 실행합니다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ObservabilityService, CONFIG_KEYS, DEFAULTS } from '../admin/observability.service';
import { SystemConfigDomainService } from '../../domain/system-config/service/system-config-domain.service';

@Injectable()
export class NasHealthCheckScheduler {
  private readonly logger = new Logger(NasHealthCheckScheduler.name);
  private lastCheckTime: Date = new Date(0);

  constructor(
    private readonly observabilityService: ObservabilityService,
    private readonly configService: SystemConfigDomainService,
  ) {}

  /**
   * 1분마다 실행 → 설정된 주기에 도달했으면 헬스체크 수행
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleHealthCheck(): Promise<void> {
    try {
      const intervalMinutes = await this.configService.getNumberConfig(
        CONFIG_KEYS.INTERVAL_MINUTES,
        DEFAULTS.INTERVAL_MINUTES,
      );

      const elapsed = Date.now() - this.lastCheckTime.getTime();
      const intervalMs = intervalMinutes * 60 * 1000;

      if (elapsed < intervalMs) {
        return;
      }

      this.lastCheckTime = new Date();
      await this.observabilityService.executeHealthCheckAndRecord();
    } catch (error) {
      this.logger.error('Scheduled health check failed:', error);
    }
  }

  /**
   * 매일 자정에 오래된 이력 정리
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanup(): Promise<void> {
    try {
      const deleted = await this.observabilityService.cleanupOldHistory();
      if (deleted > 0) {
        this.logger.log(`Cleaned up ${deleted} old health history records`);
      }
    } catch (error) {
      this.logger.error('Health history cleanup failed:', error);
    }
  }
}
