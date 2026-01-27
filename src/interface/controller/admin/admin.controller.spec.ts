/**
 * ============================================================
 * 📦 Admin 컨트롤러 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - AdminController
 *
 * 📋 비즈니스 맥락:
 *   - /v1/admin 경로의 API 엔드포인트를 제공하는 컨트롤러
 *   - 캐시 헬스체크: GET /v1/admin/cache/health-check
 *   - NAS 헬스체크: GET /v1/admin/nas/health-check
 *   - 스토리지 일관성 검증: GET /v1/admin/storage/consistency
 *   - 동기화 이벤트 조회: GET /v1/admin/sync/events
 *   - 운영자가 시스템 상태를 독립적으로 모니터링하는 데 사용
 *
 * ⚠️ 중요 고려사항:
 *   - 컨트롤러는 비즈니스 서비스에 위임만 하므로 Mock 테스트
 *   - HTTP 응답 형식이 올바른지 검증
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from '../../../business/admin';
import { StorageType } from '../../../domain/storage/file/file-storage-object.entity';
import {
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../../domain/sync-event/entities/sync-event.entity';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;

  /**
   * 🎭 Mock 설정
   * 📍 adminService.checkCacheHealth / adminService.checkNasHealth / adminService.checkStorageConsistency / adminService.getSyncEvents:
   *   - 실제 동작: 도메인 서비스를 호출하여 스토리지 상태 확인
   *   - Mock 이유: 컨트롤러는 위임만 하므로 비즈니스 로직은 별도 테스트
   */
  beforeEach(async () => {
    adminService = {
      checkCacheHealth: jest.fn(),
      checkNasHealth: jest.fn(),
      checkStorageConsistency: jest.fn(),
      getSyncEvents: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: adminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe('GET /v1/admin/cache/health-check', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - Cache Health Check API 호출
     *
     * 🎯 검증 목적:
     *   GET /v1/admin/cache/health-check 호출 시 캐시 스토리지 상태를 반환해야 한다.
     *   컨트롤러는 서비스의 결과를 그대로 반환한다.
     *
     * ✅ 기대 결과:
     *   - 서비스가 반환한 Cache Health Check 결과가 그대로 반환됨
     *   - adminService.checkCacheHealth가 1번 호출됨
     */
    it('should return cache health check result', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 15,
        checkedAt: new Date(),
      };

      adminService.checkCacheHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.checkCacheHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual(mockResult);
      expect(adminService.checkCacheHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /v1/admin/nas/health-check', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - NAS Health Check API 호출 (with capacity)
     *
     * 🎯 검증 목적:
     *   GET /v1/admin/nas/health-check 호출 시 NAS 스토리지 상태와 용량을 반환해야 한다.
     *   PowerShell UNC 방식으로 매핑된 드라이브 용량을 조회한다.
     *
     * ✅ 기대 결과:
     *   - 서비스가 반환한 NAS Health Check 결과가 그대로 반환됨
     *   - capacity 정보 포함 (totalBytes, usedBytes, freeBytes)
     *   - adminService.checkNasHealth가 1번 호출됨
     */
    it('should return nas health check result with capacity', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 45,
        checkedAt: new Date(),
        capacity: {
          totalBytes: 1099511627776,    // 1TB
          usedBytes: 549755813888,      // 500GB
          freeBytes: 549755813888,      // 500GB
          drive: 'Z:',
          provider: '\\\\192.168.10.249\\Web',
        },
      };

      adminService.checkNasHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.checkNasHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual(mockResult);
      expect(result.capacity).toBeDefined();
      expect(result.capacity?.totalBytes).toBe(1099511627776);
      expect(adminService.checkNasHealth).toHaveBeenCalledTimes(1);
    });

    /**
     * 📌 테스트 시나리오: 에러 케이스 - NAS 연결 실패
     *
     * 🎯 검증 목적:
     *   NAS 연결 실패 시 unhealthy 상태와 에러 메시지를 반환해야 한다.
     *
     * ✅ 기대 결과:
     *   - status = 'unhealthy'
     *   - error 메시지 포함
     */
    it('should return unhealthy status when NAS connection fails', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        status: 'unhealthy' as const,
        responseTimeMs: 100,
        checkedAt: new Date(),
        error: 'No mapped drive found for UNC path',
      };

      adminService.checkNasHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.checkNasHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBeDefined();
    });
  });

  describe('GET /v1/admin/storage/consistency', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 스토리지 일관성 검증 API 호출
     *
     * 🎯 검증 목적:
     *   GET /v1/admin/storage/consistency 호출 시 일관성 검증 결과를 반환해야 한다.
     *   Query 파라미터를 서비스에 전달한다.
     *
     * ✅ 기대 결과:
     *   - 서비스가 반환한 일관성 검증 결과가 그대로 반환됨
     *   - adminService.checkStorageConsistency가 1번 호출됨
     */
    it('should return storage consistency result', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        totalChecked: 100,
        inconsistencies: 2,
        issues: [
          {
            fileId: 'file-1',
            fileName: 'test.pdf',
            issueType: 'DB_ONLY' as const,
            storageType: StorageType.CACHE,
            description: 'DB에만 존재',
          },
        ],
        checkedAt: new Date(),
      };

      adminService.checkStorageConsistency.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.checkStorageConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: false,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual(mockResult);
      expect(result.issues).toHaveLength(1);
      expect(adminService.checkStorageConsistency).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /v1/admin/sync/events', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 동기화 이벤트 조회 API 호출
     *
     * 🎯 검증 목적:
     *   GET /v1/admin/sync/events 호출 시 문제가 있는 동기화 이벤트를 반환해야 한다.
     *   Query 파라미터를 서비스에 전달한다.
     *
     * ✅ 기대 결과:
     *   - 서비스가 반환한 동기화 이벤트 결과가 그대로 반환됨
     *   - adminService.getSyncEvents가 1번 호출됨
     */
    it('should return sync events result', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        summary: {
          total: 2,
          failed: 1,
          pending: 1,
          processing: 0,
          done: 0,
          stuckPending: 1,
          stuckProcessing: 0,
        },
        events: [
          {
            id: 'event-1',
            eventType: SyncEventType.CREATE,
            targetType: SyncEventTargetType.FILE,
            fileId: 'file-1',
            sourcePath: '/cache/file1.pdf',
            targetPath: '/nas/file1.pdf',
            status: SyncEventStatus.PENDING,
            retryCount: 0,
            maxRetries: 3,
            createdAt: new Date(),
            updatedAt: new Date(),
            isStuck: true,
            ageHours: 2,
          },
        ],
        pagination: {
          limit: 100,
          offset: 0,
          hasMore: false,
        },
        checkedAt: new Date(),
      };

      adminService.getSyncEvents.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.getSyncEvents({
        status: SyncEventStatus.PENDING,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual(mockResult);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].isStuck).toBe(true);
      expect(result.summary.stuckPending).toBe(1);
      expect(adminService.getSyncEvents).toHaveBeenCalledTimes(1);
    });

    /**
     * 📌 테스트 시나리오: 이벤트 타입 필터링 파라미터 전달
     *
     * 🎯 검증 목적:
     *   eventType 필터가 서비스에 올바르게 전달되어야 한다.
     *
     * ✅ 기대 결과:
     *   - eventType 파라미터가 서비스 호출 시 전달됨
     */
    it('should pass query parameters to service', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        summary: {
          total: 0,
          failed: 0,
          pending: 0,
          processing: 0,
          done: 0,
          stuckPending: 0,
          stuckProcessing: 0,
        },
        events: [],
        pagination: {
          limit: 50,
          offset: 10,
          hasMore: false,
        },
        checkedAt: new Date(),
      };

      adminService.getSyncEvents.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await controller.getSyncEvents({
        status: SyncEventStatus.FAILED,
        eventType: SyncEventType.MOVE,
        hours: 48,
        limit: 50,
        offset: 10,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(adminService.getSyncEvents).toHaveBeenCalledWith({
        status: SyncEventStatus.FAILED,
        eventType: SyncEventType.MOVE,
        hours: 48,
        limit: 50,
        offset: 10,
      });
    });
  });
});
