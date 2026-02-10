/**
 * ============================================================
 * 📦 Admin 비즈니스 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - AdminService
 *
 * 📋 비즈니스 맥락:
 *   - Admin API의 비즈니스 로직을 조율하는 서비스
 *   - 도메인 서비스를 호출하고 결과를 반환
 *   - Cache Health Check, NAS Health Check, Storage Consistency, Sync Events 기능 제공
 *
 * ⚠️ 중요 고려사항:
 *   - 도메인 서비스에 위임하는 역할이므로 Mock을 통해 테스트
 *   - 응답 형식이 DTO 스펙과 일치하는지 확인
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from '../../business/admin/admin.service';
import { CacheHealthCheckService } from '../../infra/storage/cache/cache-health-check.service';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { StorageConsistencyService } from './storage-consistency.service';
import { SyncEventStatsService } from './sync-event-stats.service';
import { CacheManagementService } from './cache-management.service';
import { StorageType } from '../../domain/storage/file/entity/file-storage-object.entity';
import {
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../domain/sync-event/entities/sync-event.entity';
import { FILE_REPOSITORY } from '../../domain/file/repositories/file.repository.interface';
import { Employee } from '../../integrations/migration/organization/entities/employee.entity';
import { EmployeeDepartmentPosition } from '../../integrations/migration/organization/entities/employee-department-position.entity';

describe('AdminService', () => {
  let service: AdminService;
  let cacheHealthCheckService: jest.Mocked<CacheHealthCheckService>;
  let nasHealthCheckService: jest.Mocked<NasHealthCheckService>;
  let storageConsistencyService: jest.Mocked<StorageConsistencyService>;
  let syncEventStatsService: jest.Mocked<SyncEventStatsService>;
  let mockFileRepository: { findByIds: jest.Mock };
  let mockEmployeeRepository: { find: jest.Mock };
  let mockEdpRepository: { find: jest.Mock };

  /**
   * 🎭 Mock 설정
   * 📍 cacheHealthCheckService.checkHealth:
   *   - 실제 동작: 캐시 스토리지에 연결하여 상태 확인
   *   - Mock 이유: 도메인 서비스 로직은 별도 테스트에서 검증
   *
   * 📍 nasHealthCheckService.checkHealth:
   *   - 실제 동작: PowerShell로 NAS 연결 및 용량 확인
   *   - Mock 이유: 도메인 서비스 로직은 별도 테스트에서 검증
   *
   * 📍 storageConsistencyService.checkConsistency:
   *   - 실제 동작: DB와 스토리지 일관성 검증
   *   - Mock 이유: 도메인 서비스 로직은 별도 테스트에서 검증
   *
   * 📍 syncEventStatsService.findProblematicEvents:
   *   - 실제 동작: 문제 있는 동기화 이벤트 조회
   *   - Mock 이유: 도메인 서비스 로직은 별도 테스트에서 검증
   */
  beforeEach(async () => {
    cacheHealthCheckService = {
      checkHealth: jest.fn(),
    } as any;

    nasHealthCheckService = {
      checkHealth: jest.fn(),
    } as any;

    storageConsistencyService = {
      checkConsistency: jest.fn(),
    } as any;

    syncEventStatsService = {
      findSyncEvents: jest.fn(),
      countByStatus: jest.fn(),
      getStuckCount: jest.fn(),
      findDashboardEvents: jest.fn(),
    } as any;

    mockFileRepository = {
      findByIds: jest.fn().mockResolvedValue([]),
    };

    mockEmployeeRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockEdpRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: CacheHealthCheckService,
          useValue: cacheHealthCheckService,
        },
        {
          provide: NasHealthCheckService,
          useValue: nasHealthCheckService,
        },
        {
          provide: StorageConsistencyService,
          useValue: storageConsistencyService,
        },
        {
          provide: SyncEventStatsService,
          useValue: syncEventStatsService,
        },
        {
          provide: CacheManagementService,
          useValue: { getCacheStatus: jest.fn(), runEviction: jest.fn() },
        },
        {
          provide: FILE_REPOSITORY,
          useValue: mockFileRepository,
        },
        {
          provide: getRepositoryToken(Employee),
          useValue: mockEmployeeRepository,
        },
        {
          provide: getRepositoryToken(EmployeeDepartmentPosition),
          useValue: mockEdpRepository,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('checkCacheHealth', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - Cache Health Check 결과 반환
     *
     * 🎯 검증 목적:
     *   도메인 서비스의 결과를 그대로 반환해야 한다.
     *   비즈니스 서비스는 도메인 로직에 개입하지 않고 위임만 한다.
     *
     * ✅ 기대 결과:
     *   - 도메인 서비스가 반환한 결과가 그대로 반환됨
     *   - checkHealth가 1번 호출됨
     */
    it('should return cache health check result from domain service', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        status: 'healthy' as const,
        responseTimeMs: 15,
        checkedAt: new Date(),
      };

      cacheHealthCheckService.checkHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkCacheHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual(mockResult);
      expect(cacheHealthCheckService.checkHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkNasHealth', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - NAS Health Check 결과 반환 (with capacity)
     *
     * 🎯 검증 목적:
     *   도메인 서비스의 결과를 그대로 반환해야 한다.
     *   용량 정보가 포함된 결과를 정확히 전달한다.
     *
     * ✅ 기대 결과:
     *   - 도메인 서비스가 반환한 결과가 그대로 반환됨
     *   - capacity 정보 포함
     *   - checkHealth가 1번 호출됨
     */
    it('should return nas health check result with capacity from domain service', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
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

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkNasHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual(mockResult);
      expect(result.capacity).toBeDefined();
      expect(nasHealthCheckService.checkHealth).toHaveBeenCalledTimes(1);
    });

    /**
     * 📌 테스트 시나리오: 에러 케이스 - NAS 연결 실패
     *
     * 🎯 검증 목적:
     *   NAS 연결 실패 시 unhealthy 상태와 에러 메시지를 그대로 반환해야 한다.
     *
     * ✅ 기대 결과:
     *   - status = 'unhealthy'
     *   - error 메시지 포함
     */
    it('should return unhealthy result when NAS connection fails', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockResult = {
        status: 'unhealthy' as const,
        responseTimeMs: 100,
        checkedAt: new Date(),
        error: 'No mapped drive found for UNC path',
      };

      nasHealthCheckService.checkHealth.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkNasHealth();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBeDefined();
    });
  });

  describe('checkStorageConsistency', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 일관성 검증 결과 반환
     *
     * 🎯 검증 목적:
     *   도메인 서비스의 결과를 그대로 반환해야 한다.
     *   이슈 목록이 포함된 결과를 정확히 전달한다.
     *
     * ✅ 기대 결과:
     *   - 도메인 서비스가 반환한 결과가 그대로 반환됨
     *   - checkConsistency가 1번 호출됨
     */
    it('should return storage consistency result from domain service', async () => {
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

      storageConsistencyService.checkConsistency.mockResolvedValue(mockResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkStorageConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: false,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual(mockResult);
      expect(storageConsistencyService.checkConsistency).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSyncEvents', () => {
    /**
     * 📌 테스트 시나리오: 정상 흐름 - 문제 동기화 이벤트 조회
     *
     * 🎯 검증 목적:
     *   도메인 서비스의 결과를 DTO 형식으로 변환하여 반환해야 한다.
     *   요약 정보, 이벤트 목록, 페이징 정보가 올바르게 포함되어야 함.
     *
     * ✅ 기대 결과:
     *   - summary, events, pagination, checkedAt이 포함된 응답 반환
     *   - findProblematicEvents가 1번 호출됨
     */
    it('should return sync events with summary and pagination from domain service', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const mockDomainResult = {
        events: [
          {
            id: 'event-1',
            eventType: SyncEventType.CREATE,
            targetType: SyncEventTargetType.FILE,
            fileId: 'file-1',
            sourcePath: '/cache/file1.pdf',
            targetPath: '/nas/file1.pdf',
            status: SyncEventStatus.PENDING,
            processBy: 'user-1',
            retryCount: 0,
            maxRetries: 3,
            createdAt: oneHourAgo,
            updatedAt: oneHourAgo,
            isStuck: true,
            ageHours: 1.5,
          },
        ],
        summary: {
          total: 1,
          failed: 0,
          pending: 1,
          processing: 0,
          stuckPending: 1,
          stuckProcessing: 0,
        },
      };

      syncEventStatsService.findSyncEvents.mockResolvedValue(mockDomainResult as any);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getSyncEvents({
        status: SyncEventStatus.PENDING,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.summary).toEqual(mockDomainResult.summary);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].isStuck).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.limit).toBe(100);
      expect(result.pagination.offset).toBe(0);
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(syncEventStatsService.findSyncEvents).toHaveBeenCalledTimes(1);
    });

    /**
     * 📌 테스트 시나리오: 이벤트 타입 필터링 파라미터 전달
     *
     * 🎯 검증 목적:
     *   eventType 파라미터가 도메인 서비스로 올바르게 전달되어야 한다.
     *
     * ✅ 기대 결과:
     *   - eventType이 도메인 서비스 호출 시 전달됨
     */
    it('should pass eventType filter to domain service', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockDomainResult = {
        events: [],
        summary: {
          total: 0,
          failed: 0,
          pending: 0,
          processing: 0,
          done: 0,
          stuckPending: 0,
          stuckProcessing: 0,
        },
      };

      syncEventStatsService.findSyncEvents.mockResolvedValue(mockDomainResult as any);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.getSyncEvents({
        status: SyncEventStatus.FAILED,
        eventType: SyncEventType.CREATE,
        hours: 24,
        limit: 50,
        offset: 10,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(syncEventStatsService.findSyncEvents).toHaveBeenCalledWith({
        status: SyncEventStatus.FAILED,
        eventType: SyncEventType.CREATE,
        hours: 24,
        limit: 50,
        offset: 10,
      });
    });

    /**
     * 📌 테스트 시나리오: 페이징 정보 hasMore 계산
     *
     * 🎯 검증 목적:
     *   반환된 이벤트 수와 전체 이벤트 수를 비교하여
     *   hasMore를 올바르게 계산해야 한다.
     *
     * ✅ 기대 결과:
     *   - 전체 이벤트 수가 limit + offset보다 크면 hasMore = true
     */
    it('should calculate hasMore correctly based on total events', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockDomainResult = {
        events: Array.from({ length: 10 }, (_, i) => ({
          id: `event-${i}`,
          eventType: SyncEventType.CREATE,
          targetType: SyncEventTargetType.FILE,
          fileId: `file-${i}`,
          sourcePath: `/cache/file${i}.pdf`,
          targetPath: `/nas/file${i}.pdf`,
          status: SyncEventStatus.PENDING,
          processBy: 'user-1',
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          isStuck: false,
          ageHours: 0.5,
        })),
        summary: {
          total: 50, // 전체 50개 중 10개만 반환
          failed: 0,
          pending: 50,
          processing: 0,
          done: 0,
          stuckPending: 0,
          stuckProcessing: 0,
        },
      };

      syncEventStatsService.findSyncEvents.mockResolvedValue(mockDomainResult as any);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getSyncEvents({
        hours: 24,
        limit: 10,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.pagination.hasMore).toBe(true);
    });
  });

  describe('getSyncDashboardSummary', () => {
    it('should return status counts and stuck count from syncEventStatsService', async () => {
      const statusCounts = {
        PENDING: 5,
        QUEUED: 2,
        PROCESSING: 1,
        RETRYING: 0,
        DONE: 100,
        FAILED: 3,
      };
      syncEventStatsService.countByStatus.mockResolvedValue(statusCounts);
      syncEventStatsService.getStuckCount.mockResolvedValue(2);

      const result = await service.getSyncDashboardSummary();

      expect(result.pending).toBe(5);
      expect(result.queued).toBe(2);
      expect(result.processing).toBe(1);
      expect(result.done).toBe(100);
      expect(result.failed).toBe(3);
      expect(result.stuckCount).toBe(2);
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(syncEventStatsService.countByStatus).toHaveBeenCalledTimes(1);
      expect(syncEventStatsService.getStuckCount).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSyncDashboardEvents', () => {
    it('should return paginated events with file and employee info', async () => {
      const userId = 'user-1';
      const createdAt = new Date();
      const mockEvents = [
        {
          id: 'event-1',
          status: SyncEventStatus.PENDING,
          eventType: SyncEventType.CREATE,
          targetType: SyncEventTargetType.FILE,
          fileId: 'file-1',
          folderId: undefined,
          sourcePath: '/cache/file1.pdf',
          targetPath: '/nas/file1.pdf',
          processedAt: undefined,
          createdAt,
          updatedAt: createdAt,
          retryCount: 0,
          maxRetries: 3,
          errorMessage: undefined,
          processBy: userId,
          metadata: {},
        },
      ];
      syncEventStatsService.findDashboardEvents.mockResolvedValue({
        events: mockEvents as any,
        total: 1,
      });
      mockFileRepository.findByIds.mockResolvedValue([
        { id: 'file-1', name: 'file1.pdf', sizeBytes: 1024 },
      ]);
      mockEmployeeRepository.find.mockResolvedValue([
        { id: userId, name: 'Test User' },
      ]);
      mockEdpRepository.find.mockResolvedValue([]);

      const result = await service.getSyncDashboardEvents({
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].fileName).toBe('file1.pdf');
      expect(result.items[0].requester.name).toBe('Test User');
      expect(result.totalItems).toBe(1);
      expect(syncEventStatsService.findDashboardEvents).toHaveBeenCalledTimes(1);
    });
  });
});
