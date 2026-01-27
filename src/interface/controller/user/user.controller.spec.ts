/**
 * ============================================================
 * 📦 UserController 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - UserController 클래스
 *
 * 📋 비즈니스 맥락:
 *   - User CRUD API 제공
 *   - Role 부여/제거 API 제공
 *   - ADMIN 권한을 가진 사용자만 접근 가능
 *
 * ⚠️ 중요 고려사항:
 *   - 권한 검사는 Guard에서 수행
 *   - 응답 형식 일관성 유지
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from '../../../business/user/user.service';
import { UserSyncService, SyncResult } from '../../../business/user/user-sync.service';
import { User } from '../../../domain/user/entities/user.entity';
import { Role } from '../../../domain/role/entities/role.entity';
import { Permission } from '../../../domain/role/entities/permission.entity';

describe('UserController', () => {
  let controller: UserController;
  let mockUserService: jest.Mocked<UserService>;
  let mockUserSyncService: jest.Mocked<UserSyncService>;

  /**
   * 🎭 Mock 설정
   * 📍 mockUserService:
   *   - 실제 동작: User 비즈니스 로직 수행
   *   - Mock 이유: 컨트롤러 로직만 테스트
   * 📍 mockUserSyncService:
   *   - 실제 동작: Employee→User 동기화
   *   - Mock 이유: 동기화 API 테스트
   */
  beforeEach(async () => {
    mockUserService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIdWithRole: jest.fn(),
      assignRole: jest.fn(),
      removeRole: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

    mockUserSyncService = {
      syncEmployeesToUsers: jest.fn(),
    } as unknown as jest.Mocked<UserSyncService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: UserSyncService,
          useValue: mockUserSyncService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  /**
   * 📌 테스트 시나리오: 전체 User 목록 조회
   *
   * 🎯 검증 목적:
   *   GET /users API 동작 검증
   *
   * ✅ 기대 결과:
   *   User 목록 반환
   */
  describe('findAll', () => {
    it('should return all users', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const users = [
        new User({
          id: 'user-1',
          roleId: 'role-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        new User({
          id: 'user-2',
          roleId: null,
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];
      mockUserService.findAll.mockResolvedValue(users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.findAll();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserService.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  /**
   * 📌 테스트 시나리오: 특정 User 조회 (Role 포함)
   *
   * 🎯 검증 목적:
   *   GET /users/:id API 동작 검증
   *
   * ✅ 기대 결과:
   *   User와 Role 정보 반환
   */
  describe('findById', () => {
    it('should return user with role', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = new User({
        id: 'user-123',
        roleId: 'role-456',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const role = new Role({
        id: 'role-456',
        name: 'MANAGER',
        permissions: [
          new Permission({ id: 'p1', code: 'FILE_READ' }),
          new Permission({ id: 'p2', code: 'FILE_WRITE' }),
        ],
      });

      mockUserService.findByIdWithRole.mockResolvedValue({ user, role });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.findById('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserService.findByIdWithRole).toHaveBeenCalledWith('user-123');
      expect(result.id).toBe('user-123');
      expect(result.role?.name).toBe('MANAGER');
      expect(result.role?.permissions).toContain('FILE_READ');
    });

    it('should return user without role when no role assigned', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = new User({
        id: 'user-123',
        roleId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockUserService.findByIdWithRole.mockResolvedValue({ user, role: null });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.findById('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.role).toBeNull();
    });
  });

  /**
   * 📌 테스트 시나리오: User에게 Role 부여
   *
   * 🎯 검증 목적:
   *   PATCH /users/:id/role API 동작 검증
   *
   * ✅ 기대 결과:
   *   Role이 부여된 User 반환
   */
  describe('assignRole', () => {
    it('should assign role to user', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = new User({
        id: 'user-123',
        roleId: 'role-456',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockUserService.assignRole.mockResolvedValue(user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.assignRole('user-123', {
        roleId: 'role-456',
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserService.assignRole).toHaveBeenCalledWith(
        'user-123',
        'role-456',
      );
      expect(result.roleId).toBe('role-456');
    });
  });

  /**
   * 📌 테스트 시나리오: User의 Role 제거
   *
   * 🎯 검증 목적:
   *   DELETE /users/:id/role API 동작 검증
   *
   * ✅ 기대 결과:
   *   Role이 제거된 User 반환
   */
  describe('removeRole', () => {
    it('should remove role from user', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = new User({
        id: 'user-123',
        roleId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockUserService.removeRole.mockResolvedValue(user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.removeRole('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserService.removeRole).toHaveBeenCalledWith('user-123');
      expect(result.roleId).toBeNull();
    });
  });

  /**
   * 📌 테스트 시나리오: Employee → User 동기화
   *
   * 🎯 검증 목적:
   *   POST /admin/users/sync API 동작 검증
   *
   * ✅ 기대 결과:
   *   동기화 결과 반환
   */
  describe('syncUsers', () => {
    it('should trigger user sync and return result', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const syncResult: SyncResult = {
        created: 5,
        activated: 2,
        deactivated: 1,
        skipped: 0,
        unchanged: 10,
        processingTimeMs: 150,
      };

      mockUserSyncService.syncEmployeesToUsers.mockResolvedValue(syncResult);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.syncUsers();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserSyncService.syncEmployeesToUsers).toHaveBeenCalled();
      expect(result.created).toBe(5);
      expect(result.activated).toBe(2);
      expect(result.deactivated).toBe(1);
    });
  });
});
