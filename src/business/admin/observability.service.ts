/**
 * Observability 비즈니스 서비스
 * NAS 모니터링 대시보드의 비즈니스 로직을 조율합니다.
 */
import { Injectable, Logger } from '@nestjs/common';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { NasStatusCacheService } from '../../infra/storage/nas/nas-status-cache.service';
import { NasHealthHistoryDomainService } from '../../domain/nas-health-history/service/nas-health-history-domain.service';
import { SystemConfigDomainService } from '../../domain/system-config/service/system-config-domain.service';
import { NasHealthStatus } from '../../domain/nas-health-history/entities/nas-health-history.entity';
import {
  ObservabilityCurrentDto,
  ObservabilityHistoryResponseDto,
  ObservabilitySettingsResponseDto,
  UpdateObservabilitySettingsDto,
} from '../../interface/controller/admin/observability/dto/observability.dto';

export const CONFIG_KEYS = {
  INTERVAL_MINUTES: 'nas.health_check.interval_minutes',
  RETENTION_DAYS: 'nas.health_check.retention_days',
  THRESHOLD_PERCENT: 'nas.health_check.threshold_percent',
} as const;

export const DEFAULTS = {
  INTERVAL_MINUTES: 5,
  RETENTION_DAYS: 7,
  THRESHOLD_PERCENT: 80,
} as const;

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(
    private readonly nasHealthCheckService: NasHealthCheckService,
    private readonly nasStatusCache: NasStatusCacheService,
    private readonly historyService: NasHealthHistoryDomainService,
    private readonly configService: SystemConfigDomainService,
  ) {}

  async getCurrent(): Promise<ObservabilityCurrentDto> {
    const result = await this.nasHealthCheckService.checkHealth();

    // Ad-hoc 조회 시에도 캐시 갱신
    this.nasStatusCache.updateFromHealthCheck({
      status: result.status,
      error: result.error,
    });

    const dto: ObservabilityCurrentDto = {
      status: result.status,
      responseTimeMs: result.responseTimeMs,
      checkedAt: result.checkedAt,
      error: result.error,
    };

    if (result.capacity) {
      dto.totalBytes = result.capacity.totalBytes;
      dto.usedBytes = result.capacity.usedBytes;
      dto.freeBytes = result.capacity.freeBytes;
      dto.usagePercent = result.capacity.totalBytes > 0
        ? Math.round((result.capacity.usedBytes / result.capacity.totalBytes) * 10000) / 100
        : 0;
      dto.serverName = this.extractServerName(result.capacity.provider);
    }

    return dto;
  }

  async getHistory(hours: number): Promise<ObservabilityHistoryResponseDto> {
    const items = await this.historyService.이력조회(hours);

    const totalCount = items.length;
    const healthyCount = items.filter(
      (i) => i.status === NasHealthStatus.HEALTHY || i.status === NasHealthStatus.DEGRADED,
    ).length;
    const healthyPercent = totalCount > 0
      ? Math.round((healthyCount / totalCount) * 10000) / 100
      : 100;

    const healthyHours = Math.round((healthyPercent / 100) * hours * 100) / 100;
    const unhealthyHours = Math.round((hours - healthyHours) * 100) / 100;

    return {
      items: items.map((i) => ({
        status: i.status,
        responseTimeMs: i.responseTimeMs,
        totalBytes: i.totalBytes,
        usedBytes: i.usedBytes,
        checkedAt: i.checkedAt,
      })),
      hours,
      totalCount,
      healthyPercent,
      healthyHours,
      unhealthyHours,
    };
  }

  async getSettings(): Promise<ObservabilitySettingsResponseDto> {
    const intervalMinutes = await this.configService.getNumberConfig(
      CONFIG_KEYS.INTERVAL_MINUTES, DEFAULTS.INTERVAL_MINUTES,
    );
    const retentionDays = await this.configService.getNumberConfig(
      CONFIG_KEYS.RETENTION_DAYS, DEFAULTS.RETENTION_DAYS,
    );
    const thresholdPercent = await this.configService.getNumberConfig(
      CONFIG_KEYS.THRESHOLD_PERCENT, DEFAULTS.THRESHOLD_PERCENT,
    );
    return { intervalMinutes, retentionDays, thresholdPercent };
  }

  async updateSettings(
    dto: UpdateObservabilitySettingsDto,
    updatedBy: string,
  ): Promise<ObservabilitySettingsResponseDto> {
    if (dto.intervalMinutes !== undefined) {
      await this.configService.updateConfig(
        CONFIG_KEYS.INTERVAL_MINUTES, String(dto.intervalMinutes), updatedBy, '헬스체크 주기 (분)',
      );
    }
    if (dto.retentionDays !== undefined) {
      await this.configService.updateConfig(
        CONFIG_KEYS.RETENTION_DAYS, String(dto.retentionDays), updatedBy, '이력 보존 기간 (일)',
      );
    }
    if (dto.thresholdPercent !== undefined) {
      await this.configService.updateConfig(
        CONFIG_KEYS.THRESHOLD_PERCENT, String(dto.thresholdPercent), updatedBy, '스토리지 사용률 임계치 (%)',
      );
    }
    return this.getSettings();
  }

  async executeHealthCheckAndRecord(): Promise<void> {
    try {
      const result = await this.nasHealthCheckService.checkHealth();

      // 인메모리 캐시 상태 갱신 (Guard/Worker가 참조)
      this.nasStatusCache.updateFromHealthCheck({
        status: result.status,
        error: result.error,
      });

      await this.historyService.이력기록({
        status: result.status as NasHealthStatus,
        responseTimeMs: result.responseTimeMs,
        totalBytes: result.capacity?.totalBytes ?? 0,
        usedBytes: result.capacity?.usedBytes ?? 0,
        freeBytes: result.capacity?.freeBytes ?? 0,
        error: result.error,
      });
      this.logger.debug(`헬스 체크 완료: ${result.status}`);
    } catch (error) {
      // 체크 자체 실패 시 unhealthy로 전환
      this.nasStatusCache.markUnhealthy(
        error instanceof Error ? error.message : 'Health check failed',
      );
      this.logger.error('헬스 체크 실패:', error);
    }
  }

  async cleanupOldHistory(): Promise<number> {
    const retentionDays = await this.configService.getNumberConfig(
      CONFIG_KEYS.RETENTION_DAYS, DEFAULTS.RETENTION_DAYS,
    );
    return this.historyService.오래된이력정리(retentionDays);
  }

  private extractServerName(provider?: string): string | undefined {
    if (!provider) return undefined;
    const normalized = provider.replace(/[\\\/]+/g, '/');
    const parts = normalized.replace(/^\/+/, '').split('/').filter((p) => p.length > 0);
    return parts[0] || undefined;
  }
}
