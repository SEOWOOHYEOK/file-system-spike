/**
 * ============================================================
 * 📦 Observability 비즈니스 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ObservabilityService.getCurrent
 *   - ObservabilityService.getHistory
 *   - ObservabilityService.getSettings
 *   - ObservabilityService.updateSettings
 *   - ObservabilityService.executeHealthCheckAndRecord
 *   - ObservabilityService.cleanupOldHistory
 *   - ObservabilityService.extractServerName (private, 간접 테스트)
 *
 * 📋 비즈니스 맥락:
 *   - NAS 모니터링 대시보드의 비즈니스 로직을 조율하는 서비스
 *   - 도메인 서비스를 호출하고 결과를 DTO로 변환
 *   - 헬스 체크 실행 및 이력 기록, 설정 관리 기능 제공
 *
 * ⚠️ 중요 고려사항:
 *   - 도메인 서비스에 위임하는 역할이므로 Mock을 통해 테스트
 *   - 응답 형식이 DTO 스펙과 일치하는지 확인
 *   - 용량 정보가 있을 때와 없을 때 모두 테스트
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ObservabilityService, CONFIG_KEYS, DEFAULTS } from './observability.service';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { NasHealthHistoryDomainService } from '../../domain/nas-health-history/service/nas-health-history-domain.service';
import { SystemConfigDomainService } from '../../domain/system-config/service/system-config-domain.service';
import {
  NasHealthHistoryEntity,
  NasHealthStatus,
} from '../../domain/nas-health-history/entities/nas-health-history.entity';

describe('ObservabilityService', () => {
  let service: ObservabilityService;
  let nasHealthCheckService: jest.Mocked<NasHealthCheckService>;
  let historyService: jest.Mocked<NasHealthHistoryDomainService>;
  let configService: jest.Mocked<SystemConfigDomainService>;

  /**
   * 🎭 Mock 설정
   * 📍 nasHealthCheckService.checkHealth:
   *   - 실제 동작: PowerShell로 NAS 연결 및 용량 확인
   *   - Mock 이유: 도메인 서비스 로직은 별도 테스트에서 검증
   *
   * 📍 historyService:
   *   - 실제 동작: DB에서 헬스 체크 이력 조회 및 저장
   *   - Mock 이유: 도메인 서비스 로직은 별도 테스트에서 검증
   *
   * 📍 configService:
   *   - 실제 동작: DB에서 시스템 설정 조회 및 업데이트
   *   - Mock 이유: 도메인 서비스 로직은 별도 테스트에서 검증
   */
  beforeEach(async () => {
    nasHealthCheckService = {
      checkHealth: jest.fn(),
    } as any;

    historyService = {
      이력조회: jest.fn(),
      이력기록: jest.fn(),
      최신이력: jest.fn(),
      오래된이력정리: jest.fn(),
    } as any;

    configService = {
      getNumberConfig: jest.fn(),
      getStringConfig: jest.fn(),
      getConfigsByPrefix: jest.fn(),
      updateConfig: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityService,
        {
          provide: NasHealthCheckService,
          useValue: nasHealthCheckService,
        },
        {
          provide: NasHealthHistoryDomainService,
          useValue: historyService,
        },
        {
          provide: SystemConfigDomainService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<ObservabilityService>(ObservabilityService);
  });

  describe('getCurrent', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 용량 정보가 있는 건강한 상태
     *
     * 🎯 검증 목적:
     *   헬스 체크 결과를 DTO로 변환하여 반환해야 한다.
     *   용량 정보가 있을 때 모든 필드가 올바르게 매핑되는지 확인.
     *
     * ✅ 기대 결과:
     *   - status, responseTimeMs, checkedAt 반환
     *   - 용량 정보(totalBytes, usedBytes, freeBytes, usagePercent) 포함
     *   - 서버명이 올바르게 추출됨
     *   - checkHealth가 1번 호출됨
     */
    it('should return current status with capacity information', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const checkedAt = new Date('2026-02-09T10:00:00Z');
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 150,
        checkedAt,
        capacity: {
          totalBytes: 1000000000,
          usedBytes: 500000000,
          freeBytes: 500000000,
          drive: 'Z:',
          provider: '\\\\192.168.10.249\\Web',
        },
      };

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getCurrent();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual({
        status: 'healthy',
        responseTimeMs: 150,
        checkedAt,
        totalBytes: 1000000000,
        usedBytes: 500000000,
        freeBytes: 500000000,
        usagePercent: 50,
        serverName: '192.168.10.249',
      });
      expect(nasHealthCheckService.checkHealth).toHaveBeenCalledTimes(1);
    });

    /**
     * 📌 테스트 시나리오: 비정상 흐름 - 용량 정보가 없는 unhealthy 상태
     *
     * 🎯 검증 목적:
     *   헬스 체크가 실패했을 때 에러 메시지가 포함되어야 한다.
     *   용량 정보가 없을 때 용량 관련 필드는 undefined여야 한다.
     *
     * ✅ 기대 결과:
     *   - status가 'unhealthy'로 반환됨
     *   - error 메시지 포함
     *   - 용량 관련 필드 없음
     */
    it('should return unhealthy status without capacity when health check fails', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const checkedAt = new Date('2026-02-09T10:00:00Z');
      const mockResult = {
        status: 'unhealthy' as const,
        responseTimeMs: 5000,
        checkedAt,
        error: 'NAS_MOUNT_PATH 환경변수가 설정되지 않았습니다.',
      };

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getCurrent();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual({
        status: 'unhealthy',
        responseTimeMs: 5000,
        checkedAt,
        error: 'NAS_MOUNT_PATH 환경변수가 설정되지 않았습니다.',
      });
      expect(result.totalBytes).toBeUndefined();
      expect(result.usedBytes).toBeUndefined();
      expect(result.freeBytes).toBeUndefined();
      expect(result.usagePercent).toBeUndefined();
      expect(result.serverName).toBeUndefined();
    });

    /**
     * 📌 테스트 시나리오: degraded 상태 - 용량 정보 포함
     *
     * 🎯 검증 목적:
     *   degraded 상태도 정상적으로 처리되어야 한다.
     *
     * ✅ 기대 결과:
     *   - status가 'degraded'로 반환됨
     *   - 용량 정보 포함
     */
    it('should return degraded status with capacity', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const checkedAt = new Date('2026-02-09T10:00:00Z');
      const mockResult = {
        status: 'degraded' as const,
        responseTimeMs: 1500,
        checkedAt,
        capacity: {
          totalBytes: 1000000000,
          usedBytes: 800000000,
          freeBytes: 200000000,
          drive: 'Z:',
          provider: '\\\\server\\share',
        },
      };

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getCurrent();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.status).toBe('degraded');
      expect(result.usagePercent).toBe(80);
      expect(result.serverName).toBe('server');
    });
  });

  describe('getHistory', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 이력 데이터가 있는 경우
     *
     * 🎯 검증 목적:
     *   이력 조회 결과를 DTO로 변환하여 반환해야 한다.
     *   정상 비율과 시간 계산이 올바른지 확인.
     *
     * ✅ 기대 결과:
     *   - items 배열 반환
     *   - totalCount, healthyPercent, healthyHours, unhealthyHours 계산됨
     *   - 이력조회가 1번 호출됨
     */
    it('should return history with calculated statistics', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const hours = 24;
      const items = [
        new NasHealthHistoryEntity({
          id: '1',
          status: NasHealthStatus.HEALTHY,
          responseTimeMs: 100,
          totalBytes: 1000000000,
          usedBytes: 500000000,
          freeBytes: 500000000,
          error: null,
          checkedAt: new Date('2026-02-09T10:00:00Z'),
        }),
        new NasHealthHistoryEntity({
          id: '2',
          status: NasHealthStatus.DEGRADED,
          responseTimeMs: 1500,
          totalBytes: 1000000000,
          usedBytes: 800000000,
          freeBytes: 200000000,
          error: null,
          checkedAt: new Date('2026-02-09T11:00:00Z'),
        }),
        new NasHealthHistoryEntity({
          id: '3',
          status: NasHealthStatus.UNHEALTHY,
          responseTimeMs: 5000,
          totalBytes: 0,
          usedBytes: 0,
          freeBytes: 0,
          error: 'Connection failed',
          checkedAt: new Date('2026-02-09T12:00:00Z'),
        }),
      ];

      historyService.이력조회.mockResolvedValue(items);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getHistory(hours);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.hours).toBe(24);
      expect(result.totalCount).toBe(3);
      expect(result.healthyPercent).toBe(66.67); // 2/3 = 66.67%
      expect(result.healthyHours).toBe(16); // 66.67% * 24 = 16
      expect(result.unhealthyHours).toBe(8); // 24 - 16 = 8
      expect(result.items).toHaveLength(3);
      expect(result.items[0]).toEqual({
        status: NasHealthStatus.HEALTHY,
        responseTimeMs: 100,
        totalBytes: 1000000000,
        usedBytes: 500000000,
        checkedAt: items[0].checkedAt,
      });
      expect(historyService.이력조회).toHaveBeenCalledWith(hours);
    });

    /**
     * 📌 테스트 시나리오: 빈 이력 데이터
     *
     * 🎯 검증 목적:
     *   이력이 없을 때도 정상적으로 처리되어야 한다.
     *
     * ✅ 기대 결과:
     *   - 빈 배열 반환
     *   - healthyPercent는 100% (전체가 정상으로 간주)
     */
    it('should return empty history with 100% healthy when no items', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const hours = 24;
      historyService.이력조회.mockResolvedValue([]);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getHistory(hours);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.hours).toBe(24);
      expect(result.totalCount).toBe(0);
      expect(result.healthyPercent).toBe(100);
      expect(result.healthyHours).toBe(24);
      expect(result.unhealthyHours).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('getSettings', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 설정값 조회
     *
     * 🎯 검증 목적:
     *   시스템 설정을 조회하여 반환해야 한다.
     *   설정이 없으면 기본값을 사용해야 한다.
     *
     * ✅ 기대 결과:
     *   - intervalMinutes, retentionDays, thresholdPercent 반환
     *   - getNumberConfig가 각 설정 키로 호출됨
     */
    it('should return settings with default values', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      configService.getNumberConfig
        .mockResolvedValueOnce(DEFAULTS.INTERVAL_MINUTES)
        .mockResolvedValueOnce(DEFAULTS.RETENTION_DAYS)
        .mockResolvedValueOnce(DEFAULTS.THRESHOLD_PERCENT);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getSettings();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual({
        intervalMinutes: DEFAULTS.INTERVAL_MINUTES,
        retentionDays: DEFAULTS.RETENTION_DAYS,
        thresholdPercent: DEFAULTS.THRESHOLD_PERCENT,
      });
      expect(configService.getNumberConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.INTERVAL_MINUTES,
        DEFAULTS.INTERVAL_MINUTES,
      );
      expect(configService.getNumberConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.RETENTION_DAYS,
        DEFAULTS.RETENTION_DAYS,
      );
      expect(configService.getNumberConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.THRESHOLD_PERCENT,
        DEFAULTS.THRESHOLD_PERCENT,
      );
    });

    /**
     * 📌 테스트 시나리오: 커스텀 설정값 조회
     *
     * 🎯 검증 목적:
     *   저장된 설정값이 있으면 기본값이 아닌 저장된 값을 반환해야 한다.
     *
     * ✅ 기대 결과:
     *   - 저장된 설정값 반환
     */
    it('should return custom settings when configured', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      configService.getNumberConfig
        .mockResolvedValueOnce(10) // intervalMinutes
        .mockResolvedValueOnce(14) // retentionDays
        .mockResolvedValueOnce(85); // thresholdPercent

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getSettings();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual({
        intervalMinutes: 10,
        retentionDays: 14,
        thresholdPercent: 85,
      });
    });
  });

  describe('updateSettings', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 모든 설정 업데이트
     *
     * 🎯 검증 목적:
     *   제공된 설정값만 업데이트하고, 업데이트 후 전체 설정을 반환해야 한다.
     *
     * ✅ 기대 결과:
     *   - updateConfig가 각 필드에 대해 호출됨
     *   - 업데이트 후 getSettings가 호출되어 최종 설정 반환
     */
    it('should update all provided settings and return updated settings', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const dto = {
        intervalMinutes: 10,
        retentionDays: 14,
        thresholdPercent: 85,
      };
      const updatedBy = 'admin-user';

      configService.updateConfig.mockResolvedValue({} as any);
      configService.getNumberConfig
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(14)
        .mockResolvedValueOnce(85);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.updateSettings(dto, updatedBy);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(configService.updateConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.INTERVAL_MINUTES,
        '10',
        updatedBy,
        '헬스체크 주기 (분)',
      );
      expect(configService.updateConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.RETENTION_DAYS,
        '14',
        updatedBy,
        '이력 보존 기간 (일)',
      );
      expect(configService.updateConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.THRESHOLD_PERCENT,
        '85',
        updatedBy,
        '스토리지 사용률 임계치 (%)',
      );
      expect(result).toEqual({
        intervalMinutes: 10,
        retentionDays: 14,
        thresholdPercent: 85,
      });
    });

    /**
     * 📌 테스트 시나리오: 부분 업데이트 - 일부 필드만 제공
     *
     * 🎯 검증 목적:
     *   제공된 필드만 업데이트하고, 제공되지 않은 필드는 업데이트하지 않아야 한다.
     *
     * ✅ 기대 결과:
     *   - 제공된 필드만 updateConfig 호출
     *   - 제공되지 않은 필드는 호출되지 않음
     */
    it('should update only provided fields', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const dto = {
        intervalMinutes: 10,
      };
      const updatedBy = 'admin-user';

      configService.updateConfig.mockResolvedValue({} as any);
      configService.getNumberConfig
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(DEFAULTS.RETENTION_DAYS)
        .mockResolvedValueOnce(DEFAULTS.THRESHOLD_PERCENT);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.updateSettings(dto, updatedBy);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(configService.updateConfig).toHaveBeenCalledTimes(1);
      expect(configService.updateConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.INTERVAL_MINUTES,
        '10',
        updatedBy,
        '헬스체크 주기 (분)',
      );
      expect(result.intervalMinutes).toBe(10);
    });
  });

  describe('executeHealthCheckAndRecord', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 헬스 체크 실행 및 기록
     *
     * 🎯 검증 목적:
     *   헬스 체크를 실행하고 결과를 이력에 기록해야 한다.
     *
     * ✅ 기대 결과:
     *   - checkHealth가 호출됨
     *   - 이력기록이 호출됨
     *   - 에러 없이 완료됨
     */
    it('should execute health check and record result', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const checkedAt = new Date('2026-02-09T10:00:00Z');
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 150,
        checkedAt,
        capacity: {
          totalBytes: 1000000000,
          usedBytes: 500000000,
          freeBytes: 500000000,
          drive: 'Z:',
          provider: '\\\\server\\share',
        },
      };

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);
      historyService.이력기록.mockResolvedValue({} as any);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.executeHealthCheckAndRecord();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(nasHealthCheckService.checkHealth).toHaveBeenCalledTimes(1);
      expect(historyService.이력기록).toHaveBeenCalledWith({
        status: NasHealthStatus.HEALTHY,
        responseTimeMs: 150,
        totalBytes: 1000000000,
        usedBytes: 500000000,
        freeBytes: 500000000,
        error: undefined,
      });
    });

    /**
     * 📌 테스트 시나리오: 용량 정보가 없는 경우
     *
     * 🎯 검증 목적:
     *   용량 정보가 없을 때도 정상적으로 기록되어야 한다.
     *
     * ✅ 기대 결과:
     *   - 용량 정보는 0으로 기록됨
     */
    it('should record with zero capacity when capacity is missing', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const checkedAt = new Date('2026-02-09T10:00:00Z');
      const mockResult = {
        status: 'unhealthy' as const,
        responseTimeMs: 5000,
        checkedAt,
        error: 'Connection failed',
      };

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);
      historyService.이력기록.mockResolvedValue({} as any);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.executeHealthCheckAndRecord();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(historyService.이력기록).toHaveBeenCalledWith({
        status: NasHealthStatus.UNHEALTHY,
        responseTimeMs: 5000,
        totalBytes: 0,
        usedBytes: 0,
        freeBytes: 0,
        error: 'Connection failed',
      });
    });

    /**
     * 📌 테스트 시나리오: 에러 처리 - 헬스 체크 실패
     *
     * 🎯 검증 목적:
     *   헬스 체크 실행 중 에러가 발생해도 서비스가 중단되지 않아야 한다.
     *
     * ✅ 기대 결과:
     *   - 에러가 로깅됨
     *   - 예외가 전파되지 않음
     */
    it('should handle error gracefully when health check fails', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      nasHealthCheckService.checkHealth.mockRejectedValue(
        new Error('Health check failed'),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await expect(service.executeHealthCheckAndRecord()).resolves.not.toThrow();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(historyService.이력기록).not.toHaveBeenCalled();
    });

    /**
     * 📌 테스트 시나리오: 에러 처리 - 이력 기록 실패
     *
     * 🎯 검증 목적:
     *   이력 기록 중 에러가 발생해도 서비스가 중단되지 않아야 한다.
     *
     * ✅ 기대 결과:
     *   - 에러가 로깅됨
     *   - 예외가 전파되지 않음
     */
    it('should handle error gracefully when recording fails', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const checkedAt = new Date('2026-02-09T10:00:00Z');
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 150,
        checkedAt,
        capacity: {
          totalBytes: 1000000000,
          usedBytes: 500000000,
          freeBytes: 500000000,
        },
      };

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);
      historyService.이력기록.mockRejectedValue(new Error('Database error'));

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await expect(service.executeHealthCheckAndRecord()).resolves.not.toThrow();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(nasHealthCheckService.checkHealth).toHaveBeenCalledTimes(1);
      expect(historyService.이력기록).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupOldHistory', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 오래된 이력 정리
     *
     * 🎯 검증 목적:
     *   보존 기간 설정을 조회하고 오래된 이력을 정리해야 한다.
     *
     * ✅ 기대 결과:
     *   - getNumberConfig로 보존 기간 조회
     *   - 오래된이력정리 호출
     *   - 삭제된 건수 반환
     */
    it('should cleanup old history based on retention days', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const retentionDays = 7;
      const deletedCount = 10;

      configService.getNumberConfig.mockResolvedValue(retentionDays);
      historyService.오래된이력정리.mockResolvedValue(deletedCount);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.cleanupOldHistory();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(configService.getNumberConfig).toHaveBeenCalledWith(
        CONFIG_KEYS.RETENTION_DAYS,
        DEFAULTS.RETENTION_DAYS,
      );
      expect(historyService.오래된이력정리).toHaveBeenCalledWith(retentionDays);
      expect(result).toBe(deletedCount);
    });
  });

  describe('extractServerName', () => {
    /**
     * 📌 테스트 시나리오: 서버명 추출 (간접 테스트)
     *
     * 🎯 검증 목적:
     *   UNC 경로에서 서버명을 올바르게 추출하는지 확인.
     *   extractServerName은 private 메서드이므로 getCurrent를 통해 간접 테스트.
     *
     * ✅ 기대 결과:
     *   - 다양한 UNC 경로 형식에서 서버명 추출
     */
    it('should extract server name from UNC path in getCurrent', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const testCases = [
        { provider: '\\\\192.168.10.249\\Web', expected: '192.168.10.249' },
        { provider: '//server/share', expected: 'server' },
        { provider: '\\\\\\\\server\\\\share', expected: 'server' },
        { provider: '/server/share', expected: 'server' },
      ];

      for (const testCase of testCases) {
        const checkedAt = new Date('2026-02-09T10:00:00Z');
        nasHealthCheckService.checkHealth.mockResolvedValue({
          status: 'healthy' as const,
          responseTimeMs: 150,
          checkedAt,
          capacity: {
            totalBytes: 1000000000,
            usedBytes: 500000000,
            freeBytes: 500000000,
            provider: testCase.provider,
          },
        });

        // ═══════════════════════════════════════════════════════
        // 🎬 WHEN (테스트 실행)
        // ═══════════════════════════════════════════════════════
        const result = await service.getCurrent();

        // ═══════════════════════════════════════════════════════
        // ✅ THEN (결과 검증)
        // ═══════════════════════════════════════════════════════
        expect(result.serverName).toBe(testCase.expected);
      }
    });

    /**
     * 📌 테스트 시나리오: provider가 없는 경우
     *
     * 🎯 검증 목적:
     *   provider가 없을 때 serverName이 undefined여야 한다.
     *
     * ✅ 기대 결과:
     *   - serverName이 undefined
     */
    it('should return undefined serverName when provider is missing', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const checkedAt = new Date('2026-02-09T10:00:00Z');
      nasHealthCheckService.checkHealth.mockResolvedValue({
        status: 'healthy' as const,
        responseTimeMs: 150,
        checkedAt,
        capacity: {
          totalBytes: 1000000000,
          usedBytes: 500000000,
          freeBytes: 500000000,
        },
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getCurrent();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.serverName).toBeUndefined();
    });
  });
});
