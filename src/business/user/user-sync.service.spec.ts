/**
 * ============================================================
 * 📦 UserSyncService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - UserSyncService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - Employee와 User 간의 동기화 담당
 *   - Admin API에서 수동으로 트리거됨 (배치 작업)
 *   - 신규 Employee → User 생성 (roleId: null)
 *   - 퇴사/휴직 Employee → User 비활성화
 *   - 복직 Employee → User 재활성화
 *
 * ⚠️ 중요 고려사항:
 *   - 퇴사 상태 Employee는 User 생성 안 함
 *   - 기존 Role은 동기화 시 변경하지 않음
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UserSyncService, SyncResult } from './user-sync.service';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository.interface';
import { User } from '../../domain/user/entities/user.entity';
import {
  Employee,
  EmployeeStatus,
} from '../../integrations/migration/organization/entities/employee.entity';
import { DomainEmployeeService } from '../../integrations/migration/organization/services/employee.service';

import type { IUserRepository } from '../../domain/user/repositories/user.repository.interface';

describe('UserSyncService', () => {
  let service: UserSyncService;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockEmployeeService: jest.Mocked<DomainEmployeeService>;

  /**
   * 🎭 Mock 설정
   * 📍 mockUserRepo:
   *   - 실제 동작: DB에서 User CRUD 수행
   *   - Mock 이유: 실제 DB 연결 없이 동기화 로직 테스트
   * 📍 mockEmployeeService:
   *   - 실제 동작: 외부 시스템에서 Employee 정보 조회
   *   - Mock 이유: 외부 의존성 없이 동기화 로직 테스트
   */
  beforeEach(async () => {
    mockUserRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      findByIds: jest.fn(),
      delete: jest.fn(),
      saveMany: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    mockEmployeeService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<DomainEmployeeService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSyncService,
        {
          provide: USER_REPOSITORY,
          useValue: mockUserRepo,
        },
        {
          provide: DomainEmployeeService,
          useValue: mockEmployeeService,
        },
      ],
    }).compile();

    service = module.get<UserSyncService>(UserSyncService);
  });

  /**
   * 📌 테스트 시나리오: 신규 Employee User 생성
   *
   * 🎯 검증 목적:
   *   재직중인 신규 Employee에 대해 User가 생성되어야 함
   *
   * ✅ 기대 결과:
   *   roleId: null, isActive: true인 User 생성
   */
  describe('syncEmployeesToUsers', () => {
    it('should create User for new active Employee', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const employees: Employee[] = [
        {
          id: 'emp-1',
          employeeNumber: 'EMP001',
          name: '홍길동',
          email: 'hong@company.com',
          status: EmployeeStatus.Active,
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
      ];

      mockEmployeeService.findAll.mockResolvedValue(employees);
      mockUserRepo.findAll.mockResolvedValue([]); // 기존 User 없음
      mockUserRepo.saveMany.mockImplementation(async (users) => users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.syncEmployeesToUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.saveMany).toHaveBeenCalled();
      const savedUsers = mockUserRepo.saveMany.mock.calls[0][0];
      expect(savedUsers).toHaveLength(1);
      expect(savedUsers[0].id).toBe('emp-1');
      expect(savedUsers[0].roleId).toBeNull();
      expect(savedUsers[0].isActive).toBe(true);
      expect(result.created).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 퇴사 Employee는 User 생성 안 함
     *
     * 🎯 검증 목적:
     *   퇴사 상태인 Employee에 대해서는 User를 생성하지 않음
     *
     * ✅ 기대 결과:
     *   User 생성되지 않음
     */
    it('should not create User for terminated Employee', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const employees: Employee[] = [
        {
          id: 'emp-1',
          employeeNumber: 'EMP001',
          name: '홍길동',
          status: EmployeeStatus.Terminated,
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
      ];

      mockEmployeeService.findAll.mockResolvedValue(employees);
      mockUserRepo.findAll.mockResolvedValue([]);
      mockUserRepo.saveMany.mockImplementation(async (users) => users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.syncEmployeesToUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 퇴사 Employee → User 비활성화
     *
     * 🎯 검증 목적:
     *   기존 User가 있는 Employee가 퇴사하면 User 비활성화
     *
     * ✅ 기대 결과:
     *   User.isActive = false
     */
    it('should deactivate User when Employee is terminated', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const employees: Employee[] = [
        {
          id: 'emp-1',
          employeeNumber: 'EMP001',
          name: '홍길동',
          status: EmployeeStatus.Terminated,
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
      ];

      const existingUsers: User[] = [
        new User({
          id: 'emp-1',
          roleId: 'role-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockEmployeeService.findAll.mockResolvedValue(employees);
      mockUserRepo.findAll.mockResolvedValue(existingUsers);
      mockUserRepo.saveMany.mockImplementation(async (users) => users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.syncEmployeesToUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.saveMany).toHaveBeenCalled();
      const savedUsers = mockUserRepo.saveMany.mock.calls[0][0];
      const deactivatedUser = savedUsers.find((u: User) => u.id === 'emp-1');
      expect(deactivatedUser.isActive).toBe(false);
      expect(result.deactivated).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 복직 Employee → User 재활성화
     *
     * 🎯 검증 목적:
     *   비활성 User의 Employee가 복직하면 User 재활성화
     *
     * ✅ 기대 결과:
     *   User.isActive = true
     */
    it('should activate User when Employee returns to active', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const employees: Employee[] = [
        {
          id: 'emp-1',
          employeeNumber: 'EMP001',
          name: '홍길동',
          status: EmployeeStatus.Active,
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
      ];

      const existingUsers: User[] = [
        new User({
          id: 'emp-1',
          roleId: 'role-1',
          isActive: false, // 비활성 상태
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockEmployeeService.findAll.mockResolvedValue(employees);
      mockUserRepo.findAll.mockResolvedValue(existingUsers);
      mockUserRepo.saveMany.mockImplementation(async (users) => users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.syncEmployeesToUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.saveMany).toHaveBeenCalled();
      const savedUsers = mockUserRepo.saveMany.mock.calls[0][0];
      const activatedUser = savedUsers.find((u: User) => u.id === 'emp-1');
      expect(activatedUser.isActive).toBe(true);
      expect(result.activated).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 기존 Role 유지
     *
     * 🎯 검증 목적:
     *   동기화 시 기존 User의 roleId는 변경하지 않음
     *
     * ✅ 기대 결과:
     *   roleId 유지
     */
    it('should preserve existing role during sync', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const employees: Employee[] = [
        {
          id: 'emp-1',
          employeeNumber: 'EMP001',
          name: '홍길동',
          status: EmployeeStatus.Active,
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
      ];

      const existingUsers: User[] = [
        new User({
          id: 'emp-1',
          roleId: 'role-manager', // 기존 Role 있음
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockEmployeeService.findAll.mockResolvedValue(employees);
      mockUserRepo.findAll.mockResolvedValue(existingUsers);
      mockUserRepo.saveMany.mockImplementation(async (users) => users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.syncEmployeesToUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 상태 변경 없으므로 saveMany 호출 안 됨 또는 roleId 유지
      expect(result.unchanged).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 휴직 Employee → User 비활성화
     *
     * 🎯 검증 목적:
     *   휴직 상태 Employee도 User 비활성화 대상
     *
     * ✅ 기대 결과:
     *   User.isActive = false
     */
    it('should deactivate User when Employee is on leave', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const employees: Employee[] = [
        {
          id: 'emp-1',
          employeeNumber: 'EMP001',
          name: '홍길동',
          status: EmployeeStatus.Leave, // 휴직
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
      ];

      const existingUsers: User[] = [
        new User({
          id: 'emp-1',
          roleId: 'role-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockEmployeeService.findAll.mockResolvedValue(employees);
      mockUserRepo.findAll.mockResolvedValue(existingUsers);
      mockUserRepo.saveMany.mockImplementation(async (users) => users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.syncEmployeesToUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.deactivated).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 동기화 결과 요약 반환
     *
     * 🎯 검증 목적:
     *   동기화 후 처리 결과 통계 반환
     *
     * ✅ 기대 결과:
     *   created, activated, deactivated, skipped, unchanged 포함
     */
    it('should return sync result summary', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const employees: Employee[] = [
        {
          id: 'emp-new',
          employeeNumber: 'EMP001',
          name: '신입',
          status: EmployeeStatus.Active,
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
        {
          id: 'emp-terminated',
          employeeNumber: 'EMP002',
          name: '퇴사자',
          status: EmployeeStatus.Terminated,
          hireDate: new Date(),
          isInitialPasswordSet: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Employee,
      ];

      const existingUsers: User[] = [
        new User({
          id: 'emp-terminated',
          roleId: 'role-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockEmployeeService.findAll.mockResolvedValue(employees);
      mockUserRepo.findAll.mockResolvedValue(existingUsers);
      mockUserRepo.saveMany.mockImplementation(async (users) => users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.syncEmployeesToUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('activated');
      expect(result).toHaveProperty('deactivated');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('unchanged');
      expect(result.created).toBe(1);
      expect(result.deactivated).toBe(1);
    });
  });
});
