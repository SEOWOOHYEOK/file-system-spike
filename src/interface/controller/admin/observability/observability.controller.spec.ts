// uuid ESM 모듈 Mock (Jest 호환)
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-mock',
}));

/**
 * ============================================================
 * Observability 컨트롤러 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - ObservabilityController
 *
 * 비즈니스 맥락:
 *   - /v1/admin/observability 경로의 API 엔드포인트를 제공하는 컨트롤러
 *   - NAS 현재 상태 조회: GET /v1/admin/observability/current
 *   - NAS 상태 이력 조회: GET /v1/admin/observability/history
 *   - Observability 설정 조회: GET /v1/admin/observability/settings
 *   - Observability 설정 변경: PUT /v1/admin/observability/settings
 *   - 운영자가 NAS 모니터링 대시보드를 통해 시스템 상태를 모니터링하는 데 사용
 *
 * 중요 고려사항:
 *   - 컨트롤러는 비즈니스 서비스에 위임만 하므로 Mock 테스트
 *   - HTTP 응답 형식이 올바른지 검증
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from '../../../../business/admin/observability.service';

describe('ObservabilityController', () => {
  let controller: ObservabilityController;
  let service: jest.Mocked<ObservabilityService>;

  /**
   * Mock 설정
   * observabilityService:
   *   - 실제 동작: 도메인 서비스를 호출하여 NAS 상태 및 설정 관리
   *   - Mock 이유: 컨트롤러는 위임만 하므로 비즈니스 로직은 별도 테스트
   */
  beforeEach(async () => {
    service = {
      getCurrent: jest.fn(),
      getHistory: jest.fn(),
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObservabilityController],
      providers: [
        { provide: ObservabilityService, useValue: service },
      ],
    }).compile();

    controller = module.get<ObservabilityController>(ObservabilityController);
  });

  describe('GET /v1/admin/observability/current', () => {
    /**
     * 테스트 시나리오: 정상 흐름 - NAS 현재 상태 조회 API 호출
     *
     * 검증 목적:
     *   GET /v1/admin/observability/current 호출 시 NAS 현재 상태를 반환해야 한다.
     *   컨트롤러는 서비스의 결과를 그대로 반환한다.
     *
     * 기대 결과:
     *   - 서비스가 반환한 현재 상태 결과가 그대로 반환됨
     *   - service.getCurrent가 1번 호출됨
     */
    it('should return current NAS status', async () => {
      // GIVEN
      const mockResult = {
        status: 'healthy',
        responseTimeMs: 45,
        checkedAt: new Date('2026-02-09T10:00:00Z'),
        totalBytes: 1099511627776,
        usedBytes: 549755813888,
        freeBytes: 549755813888,
        usagePercent: 50.0,
        serverName: '192.168.10.249',
      };

      service.getCurrent.mockResolvedValue(mockResult);

      // WHEN
      const result = await controller.getCurrent();

      // THEN
      expect(result).toEqual(mockResult);
      expect(service.getCurrent).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /v1/admin/observability/history', () => {
    /**
     * 테스트 시나리오: 정상 흐름 - NAS 상태 이력 조회 API 호출 (기본값 24시간)
     *
     * 검증 목적:
     *   GET /v1/admin/observability/history 호출 시 기본값 24시간의 이력을 반환해야 한다.
     *
     * 기대 결과:
     *   - 서비스가 반환한 이력 결과가 그대로 반환됨
     *   - service.getHistory가 hours=24로 1번 호출됨
     */
    it('should return history with default 24 hours', async () => {
      // GIVEN
      const mockResult = {
        items: [
          {
            status: 'healthy',
            responseTimeMs: 45,
            totalBytes: 1099511627776,
            usedBytes: 549755813888,
            checkedAt: new Date('2026-02-09T10:00:00Z'),
          },
        ],
        hours: 24,
        totalCount: 1,
        healthyPercent: 100.0,
        healthyHours: 24.0,
        unhealthyHours: 0.0,
      };

      service.getHistory.mockResolvedValue(mockResult);

      // WHEN
      const result = await controller.getHistory({});

      // THEN
      expect(result).toEqual(mockResult);
      expect(service.getHistory).toHaveBeenCalledTimes(1);
      expect(service.getHistory).toHaveBeenCalledWith(24);
    });

    /**
     * 테스트 시나리오: 정상 흐름 - NAS 상태 이력 조회 API 호출 (커스텀 시간)
     *
     * 검증 목적:
     *   GET /v1/admin/observability/history?hours=12 호출 시 12시간의 이력을 반환해야 한다.
     *
     * 기대 결과:
     *   - 서비스가 반환한 이력 결과가 그대로 반환됨
     *   - service.getHistory가 hours=12로 1번 호출됨
     */
    it('should return history with custom hours', async () => {
      // GIVEN
      const mockResult = {
        items: [
          {
            status: 'healthy',
            responseTimeMs: 45,
            totalBytes: 1099511627776,
            usedBytes: 549755813888,
            checkedAt: new Date('2026-02-09T10:00:00Z'),
          },
        ],
        hours: 12,
        totalCount: 1,
        healthyPercent: 100.0,
        healthyHours: 12.0,
        unhealthyHours: 0.0,
      };

      service.getHistory.mockResolvedValue(mockResult);

      // WHEN
      const result = await controller.getHistory({ hours: 12 });

      // THEN
      expect(result).toEqual(mockResult);
      expect(service.getHistory).toHaveBeenCalledTimes(1);
      expect(service.getHistory).toHaveBeenCalledWith(12);
    });
  });

  describe('GET /v1/admin/observability/settings', () => {
    /**
     * 테스트 시나리오: 정상 흐름 - Observability 설정 조회 API 호출
     *
     * 검증 목적:
     *   GET /v1/admin/observability/settings 호출 시 현재 설정을 반환해야 한다.
     *
     * 기대 결과:
     *   - 서비스가 반환한 설정 결과가 그대로 반환됨
     *   - service.getSettings가 1번 호출됨
     */
    it('should return current settings', async () => {
      // GIVEN
      const mockResult = {
        intervalMinutes: 5,
        retentionDays: 7,
        thresholdPercent: 80,
      };

      service.getSettings.mockResolvedValue(mockResult);

      // WHEN
      const result = await controller.getSettings();

      // THEN
      expect(result).toEqual(mockResult);
      expect(service.getSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('PUT /v1/admin/observability/settings', () => {
    /**
     * 테스트 시나리오: 정상 흐름 - Observability 설정 변경 API 호출
     *
     * 검증 목적:
     *   PUT /v1/admin/observability/settings 호출 시 설정을 변경하고 새로운 설정을 반환해야 한다.
     *
     * 기대 결과:
     *   - 서비스가 반환한 업데이트된 설정 결과가 그대로 반환됨
     *   - service.updateSettings가 dto와 'admin'으로 1번 호출됨
     */
    it('should update settings and return new values', async () => {
      // GIVEN
      const updateDto = {
        intervalMinutes: 10,
        retentionDays: 14,
        thresholdPercent: 85,
      };

      const mockResult = {
        intervalMinutes: 10,
        retentionDays: 14,
        thresholdPercent: 85,
      };

      service.updateSettings.mockResolvedValue(mockResult);

      // WHEN
      const result = await controller.updateSettings(updateDto);

      // THEN
      expect(result).toEqual(mockResult);
      expect(service.updateSettings).toHaveBeenCalledTimes(1);
      expect(service.updateSettings).toHaveBeenCalledWith(updateDto, 'admin');
    });
  });
});
