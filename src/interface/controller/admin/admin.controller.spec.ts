/**
 * ============================================================
 * Admin 컨트롤러 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - AdminController
 *
 * 비즈니스 맥락:
 *   - /v1/admin 경로의 API 엔드포인트를 제공하는 컨트롤러
 *   - 캐시 헬스체크: GET /v1/admin/cache/health-check
 *   - NAS 헬스체크: GET /v1/admin/nas/health-check
 *   - 스토리지 일관성 검증: GET /v1/admin/storage/consistency
 *   - 운영자가 시스템 상태를 독립적으로 모니터링하는 데 사용
 *
 * 중요 고려사항:
 *   - 컨트롤러는 비즈니스 서비스에 위임만 하므로 Mock 테스트
 *   - HTTP 응답 형식이 올바른지 검증
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService, QueueStatusService } from '../../../business/admin';
import { StorageType } from '../../../domain/storage/file/entity/file-storage-object.entity';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;

  beforeEach(async () => {
    adminService = {
      checkCacheHealth: jest.fn(),
      checkNasHealth: jest.fn(),
      checkStorageConsistency: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: adminService,
        },
        {
          provide: QueueStatusService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe('GET /v1/admin/cache/health-check', () => {
    it('should return cache health check result', async () => {
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 15,
        checkedAt: new Date(),
      };

      adminService.checkCacheHealth.mockResolvedValue(mockResult);

      const result = await controller.checkCacheHealth();

      expect(result).toEqual(mockResult);
      expect(adminService.checkCacheHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /v1/admin/nas/health-check', () => {
    it('should return nas health check result with capacity', async () => {
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 45,
        checkedAt: new Date(),
        capacity: {
          totalBytes: 1099511627776,
          usedBytes: 549755813888,
          freeBytes: 549755813888,
          drive: 'Z:',
          provider: '\\\\192.168.10.249\\Web',
        },
      };

      adminService.checkNasHealth.mockResolvedValue(mockResult);

      const result = await controller.checkNasHealth();

      expect(result).toEqual(mockResult);
      expect(result.capacity).toBeDefined();
      expect(result.capacity?.totalBytes).toBe(1099511627776);
      expect(adminService.checkNasHealth).toHaveBeenCalledTimes(1);
    });

    it('should return unhealthy status when NAS connection fails', async () => {
      const mockResult = {
        status: 'unhealthy' as const,
        responseTimeMs: 100,
        checkedAt: new Date(),
        error: 'No mapped drive found for UNC path',
      };

      adminService.checkNasHealth.mockResolvedValue(mockResult);

      const result = await controller.checkNasHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBeDefined();
    });
  });

  describe('GET /v1/admin/storage/consistency', () => {
    it('should return storage consistency result', async () => {
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

      const result = await controller.checkStorageConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: false,
      });

      expect(result).toEqual(mockResult);
      expect(result.issues).toHaveLength(1);
      expect(adminService.checkStorageConsistency).toHaveBeenCalledTimes(1);
    });
  });
});
