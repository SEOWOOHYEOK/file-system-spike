import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import {
  AUDIT_LOG_REPOSITORY,
  IAuditLogRepository,
} from '../../domain/audit/repositories/audit-log.repository.interface';
import { AuditAction } from '../../domain/audit/enums/audit-action.enum';
import { UserType, TargetType, LogResult } from '../../domain/audit/enums/common.enum';

/**
 * AuditLogService 단위 테스트
 *
 * 감사 로그 서비스의 비동기 로깅 및 배치 저장 기능 테스트
 */
describe('AuditLogService', () => {
  let service: AuditLogService;
  let mockRepository: jest.Mocked<IAuditLogRepository>;

  const mockAuditLogParams = {
    requestId: 'req-123',
    sessionId: 'sess-456',
    userId: 'user-789',
    userType: UserType.INTERNAL,
    userName: 'Test User',
    userEmail: 'test@example.com',
    action: AuditAction.FILE_DOWNLOAD,
    targetType: TargetType.FILE,
    targetId: 'file-abc',
    targetName: 'test.pdf',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    result: LogResult.SUCCESS,
  };

  beforeEach(async () => {
    mockRepository = {
      save: jest.fn().mockImplementation((log) => Promise.resolve({ ...log, id: 'log-123' })),
      saveMany: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByFilter: jest.fn(),
      findByUserId: jest.fn(),
      findByTarget: jest.fn(),
      findBySessionId: jest.fn(),
      countByUserAndAction: jest.fn(),
      countByUserActions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: AUDIT_LOG_REPOSITORY,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(async () => {
    // 서비스 종료 시 남은 로그 플러시
    await service.onModuleDestroy();
  });

  describe('log', () => {
    it('로그를 버퍼에 추가해야 함', async () => {
      // Given & When
      await service.log(mockAuditLogParams);

      // Then
      // 버퍼에 추가되므로 즉시 저장되지 않음
      expect(mockRepository.saveMany).not.toHaveBeenCalled();
    });

    it('버퍼가 가득 차면 플러시해야 함', async () => {
      // Given - 100개 로그 추가 (기본 버퍼 크기)
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          service.log({
            ...mockAuditLogParams,
            requestId: `req-${i}`,
          }),
        );
      }

      // When
      await Promise.all(promises);

      // Then
      expect(mockRepository.saveMany).toHaveBeenCalled();
    });
  });

  describe('logSuccess', () => {
    it('성공 로그를 생성해야 함', async () => {
      // Given
      const params = { ...mockAuditLogParams };
      delete (params as any).result;
      delete (params as any).failReason;

      // When
      await service.logSuccess(params);

      // Then - 버퍼에 추가됨
      // 플러시하여 확인
      await service.flush();
      expect(mockRepository.saveMany).toHaveBeenCalled();
    });
  });

  describe('logFailure', () => {
    it('실패 로그를 생성해야 함', async () => {
      // Given
      const params = {
        ...mockAuditLogParams,
        failReason: 'File not found',
      };
      delete (params as any).result;

      // When
      await service.logFailure(params);

      // Then
      await service.flush();
      expect(mockRepository.saveMany).toHaveBeenCalled();
    });
  });

  describe('logImmediate', () => {
    it('로그를 즉시 저장해야 함', async () => {
      // Given & When
      const result = await service.logImmediate(mockAuditLogParams);

      // Then
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('flush', () => {
    it('버퍼가 비어있으면 저장하지 않아야 함', async () => {
      // Given - 비어있는 버퍼

      // When
      await service.flush();

      // Then
      expect(mockRepository.saveMany).not.toHaveBeenCalled();
    });

    it('버퍼의 모든 로그를 저장해야 함', async () => {
      // Given
      await service.log(mockAuditLogParams);
      await service.log({ ...mockAuditLogParams, requestId: 'req-456' });

      // When
      await service.flush();

      // Then
      expect(mockRepository.saveMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ requestId: 'req-123' }),
          expect.objectContaining({ requestId: 'req-456' }),
        ]),
      );
    });
  });

  describe('findByFilter', () => {
    it('필터 조건으로 로그를 조회해야 함', async () => {
      // Given
      const filter = { userId: 'user-123' };
      const pagination = { page: 1, limit: 10 };
      mockRepository.findByFilter.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      // When
      const result = await service.findByFilter(filter, pagination);

      // Then
      expect(mockRepository.findByFilter).toHaveBeenCalledWith(filter, pagination);
      expect(result).toBeDefined();
    });
  });

  describe('countByUserAndAction', () => {
    it('특정 기간 내 액션 수를 카운트해야 함', async () => {
      // Given
      mockRepository.countByUserAndAction.mockResolvedValue(5);
      const since = new Date();

      // When
      const count = await service.countByUserAndAction(
        'user-123',
        AuditAction.FILE_DOWNLOAD,
        since,
      );

      // Then
      expect(count).toBe(5);
      expect(mockRepository.countByUserAndAction).toHaveBeenCalledWith(
        'user-123',
        AuditAction.FILE_DOWNLOAD,
        since,
      );
    });
  });
});
