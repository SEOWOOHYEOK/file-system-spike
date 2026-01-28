/**
 * ============================================================
 * 📦 UserQueryService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - UserQueryService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - User + Employee 크로스 도메인 조회
 *   - 이름, 사번, 재직상태 필터링
 *   - 부서/직책 정보 포함
 *
 * ⚠️ 중요 고려사항:
 *   - DDD 원칙: Repository는 단일 Aggregate만 담당
 *   - 크로스 도메인 조회는 Query Service에서 처리
 *   - 성능: 2개 쿼리로 N+1 문제 해결
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UserQueryService } from './user-query.service';
import { EmployeeStatus } from '../../integrations/migration/organization/entities/employee.entity';

describe('UserQueryService', () => {
  let service: UserQueryService;
  let mockDataSource: any;

  /**
   * 🎭 Mock 설정
   * 📍 mockDataSource:
   *   - 실제 동작: DB Raw SQL 쿼리 실행
   *   - Mock 이유: 실제 DB 연결 없이 로직 테스트
   */
  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserQueryService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<UserQueryService>(UserQueryService);
  });

  /**
   * 📌 테스트 시나리오: User + Employee 조회
   */
  describe('findAllWithEmployee', () => {
    it('should return users with employee information (optimized 2 queries)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockUserRows = [
        {
          id: 'user-1',
          isActive: true,
          roleId: 'role-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          employeeNumber: 'EMP001',
          name: '홍길동',
          email: 'hong@test.com',
          phoneNumber: '010-1234-5678',
          hireDate: new Date('2020-01-01'),
          status: EmployeeStatus.Active,
        },
      ];

      const mockDeptPosRows = [
        {
          employeeId: 'user-1',
          departmentId: 'dept-1',
          departmentName: '개발팀',
          positionId: 'pos-1',
          positionTitle: '팀장',
          isManager: true,
        },
      ];

      mockDataSource.query
        .mockResolvedValueOnce(mockUserRows)
        .mockResolvedValueOnce(mockDeptPosRows);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findAllWithEmployee({});

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('user-1');
      expect(result[0].employee?.name).toBe('홍길동');
      expect(result[0].employee?.employeeNumber).toBe('EMP001');
      expect(result[0].employee?.departmentPositions).toHaveLength(1);
      expect(result[0].employee?.departmentPositions[0].departmentName).toBe(
        '개발팀',
      );
    });

    it('should filter by name', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockDataSource.query.mockResolvedValue([]);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.findAllWithEmployee({ name: '홍길동' });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('e.name ILIKE'),
        ['%홍길동%'],
      );
    });

    it('should filter by employeeNumber', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockDataSource.query.mockResolvedValue([]);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.findAllWithEmployee({ employeeNumber: 'EMP001' });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('e."employeeNumber" ILIKE'),
        ['%EMP001%'],
      );
    });

    it('should filter by status', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockDataSource.query.mockResolvedValue([]);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.findAllWithEmployee({ status: EmployeeStatus.Active });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('e.status ='),
        [EmployeeStatus.Active],
      );
    });

    it('should return null employee when no employee data found', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockUserRows = [
        {
          id: 'user-1',
          isActive: true,
          roleId: 'role-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          employeeNumber: null,
          name: null,
          email: null,
          phoneNumber: null,
          hireDate: null,
          status: null,
        },
      ];

      mockDataSource.query.mockResolvedValue(mockUserRows);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findAllWithEmployee({});

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toHaveLength(1);
      expect(result[0].employee).toBeNull();
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple users with department positions efficiently', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockUserRows = [
        {
          id: 'user-1',
          isActive: true,
          roleId: 'role-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          employeeNumber: 'EMP001',
          name: '홍길동',
          email: 'hong@test.com',
          phoneNumber: null,
          hireDate: new Date(),
          status: EmployeeStatus.Active,
        },
        {
          id: 'user-2',
          isActive: true,
          roleId: 'role-2',
          createdAt: new Date(),
          updatedAt: new Date(),
          employeeNumber: 'EMP002',
          name: '김철수',
          email: 'kim@test.com',
          phoneNumber: null,
          hireDate: new Date(),
          status: EmployeeStatus.Active,
        },
      ];

      const mockDeptPosRows = [
        {
          employeeId: 'user-1',
          departmentId: 'dept-1',
          departmentName: '개발팀',
          positionId: 'pos-1',
          positionTitle: '팀장',
          isManager: true,
        },
        {
          employeeId: 'user-2',
          departmentId: 'dept-2',
          departmentName: '기획팀',
          positionId: 'pos-2',
          positionTitle: '사원',
          isManager: false,
        },
      ];

      mockDataSource.query
        .mockResolvedValueOnce(mockUserRows)
        .mockResolvedValueOnce(mockDeptPosRows);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findAllWithEmployee({});

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0].employee?.departmentPositions[0].departmentName).toBe('개발팀');
      expect(result[1].employee?.departmentPositions[0].departmentName).toBe('기획팀');
    });
  });
});
