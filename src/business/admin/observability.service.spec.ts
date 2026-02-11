/**
 * ============================================================
 * Observability 서비스 - NasStatusCache 연동 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - ObservabilityService (NasStatusCacheService 연동 부분)
 *
 * 비즈니스 맥락:
 *   - Health Check 결과를 인메모리 캐시에 반영
 *   - 스케줄러가 주기적으로 호출하는 executeHealthCheckAndRecord에서 캐시 갱신
 *   - Ad-hoc 조회(getCurrent)에서도 캐시 갱신
 *   - Health Check 실패 시 unhealthy로 전환
 *
 * 중요 고려사항:
 *   - NasStatusCacheService는 실제 인스턴스 사용 (인메모리이므로 mock 불필요)
 *   - NasHealthCheckService, HistoryService, ConfigService는 mock
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ObservabilityService } from './observability.service';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { NasStatusCacheService } from '../../infra/storage/nas/nas-status-cache.service';
import { NasHealthHistoryDomainService } from '../../domain/nas-health-history/service/nas-health-history-domain.service';
import { SystemConfigDomainService } from '../../domain/system-config/service/system-config-domain.service';

describe('ObservabilityService - NasStatusCache 연동', () => {
  let service: ObservabilityService;
  let nasStatusCache: NasStatusCacheService;
  let mockHealthCheckService: Record<string, jest.Mock>;
  let mockHistoryService: Record<string, jest.Mock>;
  let mockConfigService: Record<string, jest.Mock>;

  // ═══════════════════════════════════════════════════════
  // 테스트 모듈 설정
  // ═══════════════════════════════════════════════════════
  beforeEach(async () => {
    mockHealthCheckService = {
      checkHealth: jest.fn(),
    };

    mockHistoryService = {
      이력기록: jest.fn().mockResolvedValue(undefined),
      이력조회: jest.fn().mockResolvedValue([]),
      오래된이력정리: jest.fn().mockResolvedValue(0),
    };

    mockConfigService = {
      getNumberConfig: jest.fn().mockResolvedValue(5),
      updateConfig: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityService,
        NasStatusCacheService,
        { provide: NasHealthCheckService, useValue: mockHealthCheckService },
        { provide: NasHealthHistoryDomainService, useValue: mockHistoryService },
        { provide: SystemConfigDomainService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ObservabilityService>(ObservabilityService);
    nasStatusCache = module.get<NasStatusCacheService>(NasStatusCacheService);
  });

  // ═══════════════════════════════════════════════════════
  // executeHealthCheckAndRecord
  // ═══════════════════════════════════════════════════════
  describe('executeHealthCheckAndRecord', () => {
    it('healthy 결과를 캐시에 반영해야 한다', async () => {
      // 📥 GIVEN
      mockHealthCheckService.checkHealth.mockResolvedValue({
        status: 'healthy',
        responseTimeMs: 50,
        checkedAt: new Date(),
        capacity: { totalBytes: 1000, usedBytes: 500, freeBytes: 500 },
      });

      // 🎬 WHEN
      await service.executeHealthCheckAndRecord();

      // ✅ THEN: 캐시가 healthy로 갱신됨
      expect(nasStatusCache.isAvailable()).toBe(true);
      expect(nasStatusCache.getStatus().status).toBe('healthy');
    });

    it('unhealthy 결과를 캐시에 반영해야 한다', async () => {
      // 📥 GIVEN
      mockHealthCheckService.checkHealth.mockResolvedValue({
        status: 'unhealthy',
        responseTimeMs: 0,
        checkedAt: new Date(),
        error: 'NAS 연결 실패',
      });

      // 🎬 WHEN
      await service.executeHealthCheckAndRecord();

      // ✅ THEN: 캐시가 unhealthy로 갱신됨
      expect(nasStatusCache.isAvailable()).toBe(false);
      expect(nasStatusCache.getStatus().status).toBe('unhealthy');
      expect(nasStatusCache.getStatus().lastError).toBe('NAS 연결 실패');
    });

    it('degraded 결과를 캐시에 반영해야 한다', async () => {
      // 📥 GIVEN
      mockHealthCheckService.checkHealth.mockResolvedValue({
        status: 'degraded',
        responseTimeMs: 1500,
        checkedAt: new Date(),
        capacity: { totalBytes: 1000, usedBytes: 800, freeBytes: 200 },
      });

      // 🎬 WHEN
      await service.executeHealthCheckAndRecord();

      // ✅ THEN: degraded이지만 available
      expect(nasStatusCache.isAvailable()).toBe(true);
      expect(nasStatusCache.getStatus().status).toBe('degraded');
    });

    it('health check 자체가 예외를 던지면 unhealthy로 전환해야 한다', async () => {
      // 📥 GIVEN
      mockHealthCheckService.checkHealth.mockRejectedValue(
        new Error('PowerShell execution failed'),
      );

      // 🎬 WHEN
      await service.executeHealthCheckAndRecord();

      // ✅ THEN: 예외 시 unhealthy 전환
      expect(nasStatusCache.isAvailable()).toBe(false);
      expect(nasStatusCache.getStatus().lastError).toBe('PowerShell execution failed');
    });

    it('unhealthy → 다음 체크에서 healthy로 복구되면 캐시도 복구되어야 한다', async () => {
      // 📥 GIVEN: 먼저 unhealthy
      mockHealthCheckService.checkHealth.mockResolvedValueOnce({
        status: 'unhealthy',
        responseTimeMs: 0,
        checkedAt: new Date(),
        error: '타임아웃',
      });
      await service.executeHealthCheckAndRecord();
      expect(nasStatusCache.isAvailable()).toBe(false);

      // 🎬 WHEN: 다음 체크에서 healthy
      mockHealthCheckService.checkHealth.mockResolvedValueOnce({
        status: 'healthy',
        responseTimeMs: 30,
        checkedAt: new Date(),
        capacity: { totalBytes: 1000, usedBytes: 500, freeBytes: 500 },
      });
      await service.executeHealthCheckAndRecord();

      // ✅ THEN: 복구됨
      expect(nasStatusCache.isAvailable()).toBe(true);
      expect(nasStatusCache.getStatus().status).toBe('healthy');
    });
  });

  // ═══════════════════════════════════════════════════════
  // getCurrent (Ad-hoc 조회)
  // ═══════════════════════════════════════════════════════
  describe('getCurrent', () => {
    it('Ad-hoc 조회 시에도 캐시를 갱신해야 한다', async () => {
      // 📥 GIVEN
      mockHealthCheckService.checkHealth.mockResolvedValue({
        status: 'degraded',
        responseTimeMs: 1200,
        checkedAt: new Date(),
        capacity: { totalBytes: 1000, usedBytes: 900, freeBytes: 100, provider: '\\\\192.168.10.249\\Web' },
      });

      // 🎬 WHEN
      await service.getCurrent();

      // ✅ THEN: 캐시가 갱신됨
      expect(nasStatusCache.getStatus().status).toBe('degraded');
    });

    it('Ad-hoc 조회에서 unhealthy 시 캐시에 반영되어야 한다', async () => {
      // 📥 GIVEN
      mockHealthCheckService.checkHealth.mockResolvedValue({
        status: 'unhealthy',
        responseTimeMs: 0,
        checkedAt: new Date(),
        error: '연결 거부',
      });

      // 🎬 WHEN
      await service.getCurrent();

      // ✅ THEN
      expect(nasStatusCache.isAvailable()).toBe(false);
      expect(nasStatusCache.getStatus().lastError).toBe('연결 거부');
    });
  });
});
