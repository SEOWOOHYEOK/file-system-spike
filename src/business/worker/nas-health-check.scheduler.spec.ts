/**
 * ============================================================
 * 📦 NAS 헬스체크 스케줄러 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - NasHealthCheckScheduler.handleHealthCheck
 *   - NasHealthCheckScheduler.handleCleanup
 *
 * 📋 비즈니스 맥락:
 *   - 1분마다 실행되지만 설정된 주기에 도달했을 때만 헬스체크 수행
 *   - 매일 자정에 오래된 이력 정리
 *
 * ⚠️ 중요 고려사항:
 *   - lastCheckTime을 조작하여 주기 검증 테스트
 *   - 에러 발생 시 로깅만 하고 예외 전파하지 않음
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NasHealthCheckScheduler } from './nas-health-check.scheduler';
import { ObservabilityService, CONFIG_KEYS, DEFAULTS } from '../admin/observability.service';
import { SystemConfigDomainService } from '../../domain/system-config/service/system-config-domain.service';

describe('NasHealthCheckScheduler', () => {
  let scheduler: NasHealthCheckScheduler;
  let observabilityService: jest.Mocked<ObservabilityService>;
  let configService: jest.Mocked<SystemConfigDomainService>;

  beforeEach(async () => {
    observabilityService = {
      executeHealthCheckAndRecord: jest.fn(),
      cleanupOldHistory: jest.fn(),
    } as any;

    configService = {
      getNumberConfig: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NasHealthCheckScheduler,
        { provide: ObservabilityService, useValue: observabilityService },
        { provide: SystemConfigDomainService, useValue: configService },
      ],
    }).compile();

    scheduler = module.get(NasHealthCheckScheduler);
  });

  /**
   * 📌 테스트 시나리오: handleHealthCheck - 주기가 경과했을 때 헬스체크 실행
   *
   * 🎯 검증 목적:
   *   설정된 주기가 경과했을 때 헬스체크가 실행되고 lastCheckTime이 업데이트되는지 확인
   *
   * ✅ 기대 결과:
   *   executeHealthCheckAndRecord 호출됨
   *   lastCheckTime이 현재 시간으로 업데이트됨
   */
  it('should execute health check when interval elapsed', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const intervalMinutes = 5;
    configService.getNumberConfig.mockResolvedValue(intervalMinutes);

    // lastCheckTime을 과거로 설정 (주기 경과 상태)
    const pastTime = new Date(Date.now() - (intervalMinutes + 1) * 60 * 1000);
    (scheduler as any).lastCheckTime = pastTime;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await scheduler.handleHealthCheck();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(configService.getNumberConfig).toHaveBeenCalledWith(
      CONFIG_KEYS.INTERVAL_MINUTES,
      DEFAULTS.INTERVAL_MINUTES,
    );
    expect(observabilityService.executeHealthCheckAndRecord).toHaveBeenCalledTimes(1);
    expect((scheduler as any).lastCheckTime.getTime()).toBeGreaterThan(pastTime.getTime());
  });

  /**
   * 📌 테스트 시나리오: handleHealthCheck - 주기가 경과하지 않았을 때 스킵
   *
   * 🎯 검증 목적:
   *   설정된 주기가 경과하지 않았을 때 헬스체크가 실행되지 않는지 확인
   *
   * ✅ 기대 결과:
   *   executeHealthCheckAndRecord 호출되지 않음
   *   lastCheckTime이 변경되지 않음
   */
  it('should skip when interval not elapsed', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const intervalMinutes = 5;
    configService.getNumberConfig.mockResolvedValue(intervalMinutes);

    // lastCheckTime을 현재 시간으로 설정 (주기 미경과 상태)
    const now = new Date();
    (scheduler as any).lastCheckTime = now;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await scheduler.handleHealthCheck();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(configService.getNumberConfig).toHaveBeenCalledWith(
      CONFIG_KEYS.INTERVAL_MINUTES,
      DEFAULTS.INTERVAL_MINUTES,
    );
    expect(observabilityService.executeHealthCheckAndRecord).not.toHaveBeenCalled();
    expect((scheduler as any).lastCheckTime).toBe(now);
  });

  /**
   * 📌 테스트 시나리오: handleHealthCheck - 에러 발생 시 graceful 처리
   *
   * 🎯 검증 목적:
   *   에러 발생 시 로깅만 하고 예외가 전파되지 않는지 확인
   *
   * ✅ 기대 결과:
   *   예외가 전파되지 않음
   */
  it('should handle errors gracefully', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const error = new Error('Config service error');
    configService.getNumberConfig.mockRejectedValue(error);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await expect(scheduler.handleHealthCheck()).resolves.not.toThrow();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(observabilityService.executeHealthCheckAndRecord).not.toHaveBeenCalled();
  });

  /**
   * 📌 테스트 시나리오: handleCleanup - 레코드 삭제 시 로그 기록
   *
   * 🎯 검증 목적:
   *   레코드가 삭제되었을 때 로그가 기록되는지 확인
   *
   * ✅ 기대 결과:
   *   cleanupOldHistory 호출됨
   *   로그가 기록됨 (Logger.log 호출 확인)
   */
  it('should run cleanup and log when records deleted', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const deletedCount = 10;
    observabilityService.cleanupOldHistory.mockResolvedValue(deletedCount);

    const loggerSpy = jest.spyOn((scheduler as any).logger, 'log');

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await scheduler.handleCleanup();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(observabilityService.cleanupOldHistory).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      `Cleaned up ${deletedCount} old health history records`,
    );
  });

  /**
   * 📌 테스트 시나리오: handleCleanup - 레코드 삭제 없을 때 로그 미기록
   *
   * 🎯 검증 목적:
   *   삭제된 레코드가 없을 때 로그가 기록되지 않는지 확인
   *
   * ✅ 기대 결과:
   *   cleanupOldHistory 호출됨
   *   로그가 기록되지 않음
   */
  it('should not log when no records deleted', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const deletedCount = 0;
    observabilityService.cleanupOldHistory.mockResolvedValue(deletedCount);

    const loggerSpy = jest.spyOn((scheduler as any).logger, 'log');

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await scheduler.handleCleanup();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(observabilityService.cleanupOldHistory).toHaveBeenCalledTimes(1);
    expect(loggerSpy).not.toHaveBeenCalled();
  });

  /**
   * 📌 테스트 시나리오: handleCleanup - 에러 발생 시 graceful 처리
   *
   * 🎯 검증 목적:
   *   에러 발생 시 로깅만 하고 예외가 전파되지 않는지 확인
   *
   * ✅ 기대 결과:
   *   예외가 전파되지 않음
   */
  it('should handle errors gracefully', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const error = new Error('Cleanup error');
    observabilityService.cleanupOldHistory.mockRejectedValue(error);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await expect(scheduler.handleCleanup()).resolves.not.toThrow();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(observabilityService.cleanupOldHistory).toHaveBeenCalledTimes(1);
  });
});
