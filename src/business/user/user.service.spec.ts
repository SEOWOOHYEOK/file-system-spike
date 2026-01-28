/**
 * ============================================================
 * 📦 UserService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - UserService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - User CRUD 작업 수행
 *   - Role 부여/제거 담당
 *   - PermissionsGuard에서 사용자 권한 조회 시 호출됨
 *
 * ⚠️ 중요 고려사항:
 *   - 존재하지 않는 User/Role에 대한 예외 처리
 *   - 비활성 User 접근 시 처리
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository.interface';
import { ROLE_REPOSITORY } from '../../domain/role/repositories/role.repository.interface';
import { User } from '../../domain/user/entities/user.entity';
import { Role } from '../../domain/role/entities/role.entity';
import { RoleNameEnum } from '../../domain/role/role-name.enum';

import type { IUserRepository } from '../../domain/user/repositories/user.repository.interface';
import type { IRoleRepository } from '../../domain/role/repositories/role.repository.interface';

describe('UserService', () => {
  let service: UserService;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockRoleRepo: jest.Mocked<IRoleRepository>;

  /**
   * 🎭 Mock 설정
   * 📍 mockUserRepo:
   *   - 실제 동작: DB에서 User CRUD 수행
   *   - Mock 이유: 실제 DB 연결 없이 서비스 로직 테스트
   * 📍 mockRoleRepo:
   *   - 실제 동작: DB에서 Role 조회
   *   - Mock 이유: Role 존재 여부 검증을 위한 Mock
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

    mockRoleRepo = {
      findById: jest.fn(),
      findByName: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      findByUserId: jest.fn(),
    } as jest.Mocked<IRoleRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: USER_REPOSITORY,
          useValue: mockUserRepo,
        },
        {
          provide: ROLE_REPOSITORY,
          useValue: mockRoleRepo,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  /**
   * 📌 테스트 시나리오: 전체 User 목록 조회
   *
   * 🎯 검증 목적:
   *   모든 User를 조회하는 기능 검증
   *
   * ✅ 기대 결과:
   *   User 배열 반환
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
      mockUserRepo.findAll.mockResolvedValue(users);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findAll();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  /**
   * 📌 테스트 시나리오: ID로 User 조회
   *
   * 🎯 검증 목적:
   *   특정 ID의 User를 조회하는 기능 검증
   *
   * ✅ 기대 결과:
   *   존재하면 User 반환, 없으면 NotFoundException
   */
  describe('findById', () => {
    it('should return user when found', async () => {
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
      mockUserRepo.findById.mockResolvedValue(user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findById('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.findById).toHaveBeenCalledWith('user-123');
      expect(result.id).toBe('user-123');
    });

    it('should throw NotFoundException when user not found', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockUserRepo.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * 📌 테스트 시나리오: User에게 Role 부여
   *
   * 🎯 검증 목적:
   *   관리자가 User에게 Role을 부여하는 기능 검증
   *
   * ✅ 기대 결과:
   *   roleId가 변경되고 저장됨
   */
  describe('assignRole', () => {
    it('should assign role to user', async () => {
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
      const role = new Role({
        id: 'role-456',
        name: 'MANAGER',
        permissions: [],
      });

      mockUserRepo.findById.mockResolvedValue(user);
      mockRoleRepo.findById.mockResolvedValue(role);
      mockUserRepo.save.mockImplementation(async (u) => u);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.assignRole('user-123', 'role-456');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockRoleRepo.findById).toHaveBeenCalledWith('role-456');
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(result.roleId).toBe('role-456');
    });

    it('should throw NotFoundException when user not found', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockUserRepo.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.assignRole('non-existent', 'role-456'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when role not found', async () => {
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
      mockUserRepo.findById.mockResolvedValue(user);
      mockRoleRepo.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.assignRole('user-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user is inactive', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = new User({
        id: 'user-123',
        roleId: null,
        isActive: false, // 비활성 User
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockUserRepo.findById.mockResolvedValue(user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.assignRole('user-123', 'role-456'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  /**
   * 📌 테스트 시나리오: User의 Role 제거
   *
   * 🎯 검증 목적:
   *   관리자가 User의 Role을 제거하는 기능 검증
   *
   * ✅ 기대 결과:
   *   roleId가 null로 변경되고 저장됨
   */
  describe('removeRole', () => {
    it('should remove role from user', async () => {
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
      mockUserRepo.findById.mockResolvedValue(user);
      mockUserRepo.save.mockImplementation(async (u) => u);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.removeRole('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(result.roleId).toBeNull();
    });

    it('should throw NotFoundException when user not found', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockUserRepo.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(service.removeRole('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * 📌 테스트 시나리오: User와 Role 정보 함께 조회
   *
   * 🎯 검증 목적:
   *   User 조회 시 Role 정보도 함께 가져오는 기능 검증
   *   Role이 없는 활성 사용자에게는 기본 USER 역할 자동 할당
   *
   * ✅ 기대 결과:
   *   User와 Role 정보가 함께 반환됨
   *   Role이 없는 활성 사용자는 기본 USER 역할이 자동 할당됨
   */
  describe('findByIdWithRole', () => {
    it('should return user with role information', async () => {
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
        permissions: [],
      });

      mockUserRepo.findById.mockResolvedValue(user);
      mockRoleRepo.findById.mockResolvedValue(role);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findByIdWithRole('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.user.id).toBe('user-123');
      expect(result.role?.name).toBe('MANAGER');
    });

    /**
     * 📌 테스트 시나리오: Role이 없는 활성 사용자에게 기본 USER 역할 자동 할당
     *
     * 🎯 검증 목적:
     *   roleId가 null인 활성 사용자 조회 시 기본 USER 역할이 자동 할당되는지 검증
     *
     * ✅ 기대 결과:
     *   - 기본 USER 역할이 조회됨
     *   - 사용자에게 USER 역할이 할당됨
     *   - 저장소에 저장됨
     */
    it('should auto-assign default USER role to active user with no role', async () => {
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
      const defaultRole = new Role({
        id: 'default-role-id',
        name: RoleNameEnum.USER,
        permissions: [],
      });

      mockUserRepo.findById.mockResolvedValue(user);
      mockRoleRepo.findByName.mockResolvedValue(defaultRole);
      mockUserRepo.save.mockImplementation(async (u) => u);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findByIdWithRole('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockRoleRepo.findByName).toHaveBeenCalledWith(RoleNameEnum.USER);
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(result.user.roleId).toBe('default-role-id');
      expect(result.role?.name).toBe(RoleNameEnum.USER);
    });

    /**
     * 📌 테스트 시나리오: 비활성 사용자는 기본 역할 자동 할당 건너뜀
     *
     * 🎯 검증 목적:
     *   비활성(isActive=false) 사용자는 기본 역할을 자동 할당하지 않음
     *
     * ✅ 기대 결과:
     *   - 기본 역할 조회는 시도됨
     *   - 사용자에게 역할 할당 안됨 (save 호출 안됨)
     *   - role은 null로 반환됨
     */
    it('should not auto-assign role to inactive user', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = new User({
        id: 'user-123',
        roleId: null,
        isActive: false, // 비활성 사용자
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const defaultRole = new Role({
        id: 'default-role-id',
        name: RoleNameEnum.USER,
        permissions: [],
      });

      mockUserRepo.findById.mockResolvedValue(user);
      mockRoleRepo.findByName.mockResolvedValue(defaultRole);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findByIdWithRole('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockRoleRepo.findByName).toHaveBeenCalledWith(RoleNameEnum.USER);
      expect(mockUserRepo.save).not.toHaveBeenCalled();
      expect(result.user.roleId).toBeNull();
      expect(result.role).toBeNull();
    });

    /**
     * 📌 테스트 시나리오: 기본 USER 역할이 DB에 없는 경우
     *
     * 🎯 검증 목적:
     *   시스템 초기화가 안 된 상태에서 기본 역할을 찾지 못하는 경우 처리
     *
     * ✅ 기대 결과:
     *   - role이 null로 반환됨
     *   - 에러가 발생하지 않음
     */
    it('should return null role when default USER role does not exist in DB', async () => {
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

      mockUserRepo.findById.mockResolvedValue(user);
      mockRoleRepo.findByName.mockResolvedValue(null); // 기본 역할 없음

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findByIdWithRole('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockRoleRepo.findByName).toHaveBeenCalledWith(RoleNameEnum.USER);
      expect(mockUserRepo.save).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-123');
      expect(result.role).toBeNull();
    });

    /**
     * 📌 테스트 시나리오: 기존 roleId에 해당하는 Role이 없는 경우 기본 역할 할당
     *
     * 🎯 검증 목적:
     *   사용자의 roleId가 있지만 해당 Role이 삭제된 경우 기본 역할 자동 할당
     *
     * ✅ 기대 결과:
     *   - 기본 USER 역할이 할당됨
     */
    it('should auto-assign default role when existing roleId references non-existent role', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const user = new User({
        id: 'user-123',
        roleId: 'deleted-role-id', // 삭제된 역할 ID
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const defaultRole = new Role({
        id: 'default-role-id',
        name: RoleNameEnum.USER,
        permissions: [],
      });

      mockUserRepo.findById.mockResolvedValue(user);
      mockRoleRepo.findById.mockResolvedValue(null); // 기존 역할 없음
      mockRoleRepo.findByName.mockResolvedValue(defaultRole);
      mockUserRepo.save.mockImplementation(async (u) => u);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findByIdWithRole('user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockRoleRepo.findById).toHaveBeenCalledWith('deleted-role-id');
      expect(mockRoleRepo.findByName).toHaveBeenCalledWith(RoleNameEnum.USER);
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(result.user.roleId).toBe('default-role-id');
      expect(result.role?.name).toBe(RoleNameEnum.USER);
    });

    it('should throw NotFoundException when user not found', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockUserRepo.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(service.findByIdWithRole('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
