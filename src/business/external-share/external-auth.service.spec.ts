/**
 * ============================================================
 * 📦 ExternalAuthService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalAuthService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 외부 사용자 로그인/로그아웃 처리
 *   - JWT 토큰 발급
 *   - 비밀번호 변경 기능
 *
 * ⚠️ 중요 고려사항:
 *   - 비활성화된 계정은 로그인 불가
 *   - 비밀번호 검증 후 JWT 발급
 *   - 마지막 로그인 시간 갱신
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ExternalAuthService } from './external-auth.service';
import {
  EXTERNAL_USER_REPOSITORY,
  IExternalUserRepository,
} from '../../domain/external-share/repositories/external-user.repository.interface';
import { ExternalUser } from '../../domain/external-share/entities/external-user.entity';
import * as bcrypt from 'bcrypt';

describe('ExternalAuthService', () => {
  let service: ExternalAuthService;
  let mockUserRepo: jest.Mocked<IExternalUserRepository>;
  let mockJwtService: jest.Mocked<JwtService>;

  /**
   * 🎭 Mock 설정
   * 📍 mockUserRepo: ExternalUser 영속성 관리
   * 📍 mockJwtService: JWT 토큰 발급
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

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalAuthService,
        {
          provide: EXTERNAL_USER_REPOSITORY,
          useValue: mockUserRepo,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<ExternalAuthService>(ExternalAuthService);
  });

  /**
   * 📌 테스트 시나리오: 로그인 (login)
   */
  describe('login', () => {
    /**
     * 🎯 검증 목적: 정상적인 로그인 및 JWT 발급
     */
    it('should login successfully and return JWT token', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const hashedPassword = await bcrypt.hash('correct_password', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        passwordHash: hashedPassword,
        name: '홍길동',
        email: 'hong@partner.com',
        isActive: true,
        createdBy: 'admin-123',
      });
      mockUserRepo.findByUsername.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation(async (user) => user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.login({
        username: 'partner_user',
        password: 'correct_password',
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.id).toBe('ext-user-123');
      expect(result.user.name).toBe('홍길동');
      expect(mockJwtService.sign).toHaveBeenCalled();
      expect(mockUserRepo.save).toHaveBeenCalled(); // lastLoginAt 갱신
    });

    /**
     * 🎯 검증 목적: 사용자가 존재하지 않으면 UnauthorizedException
     */
    it('should throw UnauthorizedException when user not found', async () => {
      mockUserRepo.findByUsername.mockResolvedValue(null);

      await expect(
        service.login({ username: 'unknown', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * 🎯 검증 목적: 비밀번호가 틀리면 UnauthorizedException
     */
    it('should throw UnauthorizedException when password is incorrect', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        passwordHash: hashedPassword,
        isActive: true,
        createdBy: 'admin-123',
      });
      mockUserRepo.findByUsername.mockResolvedValue(existingUser);

      await expect(
        service.login({ username: 'partner_user', password: 'wrong_password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * 🎯 검증 목적: 비활성화된 계정이면 ForbiddenException
     */
    it('should throw ForbiddenException when account is deactivated', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        passwordHash: hashedPassword,
        isActive: false, // 비활성화
        createdBy: 'admin-123',
      });
      mockUserRepo.findByUsername.mockResolvedValue(existingUser);

      await expect(
        service.login({ username: 'partner_user', password: 'correct_password' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * 📌 테스트 시나리오: 비밀번호 변경 (changePassword)
   */
  describe('changePassword', () => {
    /**
     * 🎯 검증 목적: 현재 비밀번호 검증 후 새 비밀번호로 변경
     */
    it('should change password successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const currentHashedPassword = await bcrypt.hash('current_password', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        passwordHash: currentHashedPassword,
        isActive: true,
        createdBy: 'admin-123',
      });
      mockUserRepo.findById.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation(async (user) => user);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.changePassword('ext-user-123', {
        currentPassword: 'current_password',
        newPassword: 'new_secure_password',
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockUserRepo.save).toHaveBeenCalled();
      const savedUser = mockUserRepo.save.mock.calls[0][0];
      // 새 비밀번호가 해시로 저장되었는지 확인
      expect(savedUser.passwordHash).not.toBe('new_secure_password');
      expect(savedUser.passwordHash).not.toBe(currentHashedPassword);
    });

    /**
     * 🎯 검증 목적: 현재 비밀번호가 틀리면 UnauthorizedException
     */
    it('should throw UnauthorizedException when current password is incorrect', async () => {
      const currentHashedPassword = await bcrypt.hash('current_password', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        passwordHash: currentHashedPassword,
        isActive: true,
        createdBy: 'admin-123',
      });
      mockUserRepo.findById.mockResolvedValue(existingUser);

      await expect(
        service.changePassword('ext-user-123', {
          currentPassword: 'wrong_password',
          newPassword: 'new_password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
