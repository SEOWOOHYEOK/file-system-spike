/**
 * ============================================================
 * 📦 ExternalUserManagementService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalUserManagementService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 관리자가 외부 사용자 계정을 생성/관리
 *   - 계정 활성화/비활성화로 접근 제어
 *   - 비밀번호 초기화 기능 제공
 *
 * ⚠️ 중요 고려사항:
 *   - username 중복 불가
 *   - 비밀번호는 해시로 저장
 *   - 관리자만 접근 가능한 기능
 * ============================================================
 */
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-external-user-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExternalUserManagementService } from './external-user-management.service';
import {
  EXTERNAL_USER_REPOSITORY,
  IExternalUserRepository,
} from '../../domain/external-share/repositories/external-user.repository.interface';
import { ExternalUser } from '../../domain/external-share/entities/external-user.entity';

describe('ExternalUserManagementService', () => {
  let service: ExternalUserManagementService;
  let mockUserRepo: jest.Mocked<IExternalUserRepository>;

  /**
   * 🎭 Mock 설정
   * 📍 mockUserRepo: ExternalUser 영속성 관리
   */
  beforeEach(async () => {
    mockUserRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUsername: jest.fn(),
      findByEmail: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IExternalUserRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalUserManagementService,
        {
          provide: EXTERNAL_USER_REPOSITORY,
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<ExternalUserManagementService>(
      ExternalUserManagementService,
    );
  });

  /**
   * 📌 테스트 시나리오: 외부 사용자 생성 (createExternalUser)
   */
  describe('createExternalUser', () => {
    const createUserDto = {
      username: 'partner_user',
      password: 'secure_password_123',
      name: '홍길동',
      email: 'hong@partner.com',
      company: '협력사A',
      phone: '010-1234-5678',
    };

    /**
     * 🎯 검증 목적: 정상적인 외부 사용자 생성
     */
    it('should create an external user successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockUserRepo.findByUsername.mockResolvedValue(null); // 중복 없음
      mockUserRepo.save.mockImplementation(async (user) => user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.createExternalUser('admin-123', createUserDto);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith('partner_user');
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(result.username).toBe('partner_user');
      expect(result.name).toBe('홍길동');
      expect(result.createdBy).toBe('admin-123');
      expect(result.isActive).toBe(true);
      // 비밀번호는 해시로 저장되어야 함
      expect(result.passwordHash).not.toBe('secure_password_123');
    });

    /**
     * 🎯 검증 목적: username 중복 시 ConflictException
     */
    it('should throw ConflictException when username already exists', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockUserRepo.findByUsername.mockResolvedValue(
        new ExternalUser({
          id: 'existing-user',
          username: 'partner_user',
        }),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.createExternalUser('admin-123', createUserDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  /**
   * 📌 테스트 시나리오: 외부 사용자 정보 수정 (updateExternalUser)
   */
  describe('updateExternalUser', () => {
    const updateDto = {
      name: '김철수',
      company: '협력사B',
      phone: '010-9999-8888',
    };

    /**
     * 🎯 검증 목적: 정상적인 정보 수정
     */
    it('should update external user successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        name: '홍길동',
        email: 'hong@partner.com',
        createdBy: 'admin-123',
      });
      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation(async (user) => user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.updateExternalUser('ext-user-123', updateDto);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.name).toBe('김철수');
      expect(result.company).toBe('협력사B');
      expect(result.phone).toBe('010-9999-8888');
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 NotFoundException
     */
    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateExternalUser('non-existent', updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * 📌 테스트 시나리오: 계정 비활성화 (deactivateUser)
   */
  describe('deactivateUser', () => {
    /**
     * 🎯 검증 목적: 정상적인 비활성화
     */
    it('should deactivate user successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        isActive: true,
        createdBy: 'admin-123',
      });
      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation(async (user) => user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.deactivateUser('ext-user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.isActive).toBe(false);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 NotFoundException
     */
    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.deactivateUser('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 계정 활성화 (activateUser)
   */
  describe('activateUser', () => {
    /**
     * 🎯 검증 목적: 정상적인 활성화
     */
    it('should activate user successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        isActive: false,
        createdBy: 'admin-123',
      });
      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation(async (user) => user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.activateUser('ext-user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.isActive).toBe(true);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });
  });

  /**
   * 📌 테스트 시나리오: 비밀번호 초기화 (resetPassword)
   */
  describe('resetPassword', () => {
    /**
     * 🎯 검증 목적: 새 비밀번호 생성 및 해시 저장
     */
    it('should reset password and return new temporary password', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        passwordHash: 'old_hash',
        createdBy: 'admin-123',
      });
      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation(async (user) => user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.resetPassword('ext-user-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword.length).toBeGreaterThan(8);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 NotFoundException
     */
    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.resetPassword('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 외부 사용자 목록 조회 (getExternalUsers)
   */
  describe('getExternalUsers', () => {
    /**
     * 🎯 검증 목적: 페이지네이션 적용된 목록 반환
     */
    it('should return paginated external users', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const users = [
        new ExternalUser({ id: 'user-1', username: 'user1', createdBy: 'admin' }),
        new ExternalUser({ id: 'user-2', username: 'user2', createdBy: 'admin' }),
      ];
      mockUserRepo.findAll.mockResolvedValue({
        items: users,
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getExternalUsers({ page: 1, pageSize: 20 });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.items).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.totalItems).toBe(2);
    });
  });

  /**
   * 📌 테스트 시나리오: 외부 사용자 상세 조회 (getExternalUserById)
   */
  describe('getExternalUserById', () => {
    /**
     * 🎯 검증 목적: 정상 조회
     */
    it('should return external user by id', async () => {
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        createdBy: 'admin-123',
      });
      mockUserRepo.findById.mockResolvedValue(existingUser);

      const result = await service.getExternalUserById('ext-user-123');

      expect(result.id).toBe('ext-user-123');
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 NotFoundException
     */
    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.getExternalUserById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
