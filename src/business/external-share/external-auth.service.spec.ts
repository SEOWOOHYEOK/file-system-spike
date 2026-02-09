/**
 * ============================================================
 * ExternalAuthService 테스트 (Unit Test)
 * ============================================================
 *
 * 테스트 대상:
 *   - ExternalAuthService 클래스
 *
 * 시나리오 매핑:
 *   - SC-001: 외부 사용자 로그인 성공
 *   - SC-002: Access Token 갱신 성공
 *   - SC-003: 로그아웃 성공
 *   - SC-004: 비밀번호 변경 성공
 *
 * 중요 고려사항:
 *   - 비활성화된 계정은 로그인 불가
 *   - 5회 실패 시 30분 계정 잠금
 *   - 로그아웃/비밀번호 변경 시 토큰 블랙리스트 등록
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ExternalAuthService } from './external-auth.service';
import { ExternalUserDomainService } from '../../domain/external-share';
import { ExternalUser } from '../../domain/external-share/entities/external-user.entity';
import { LoginAttemptService } from './security/login-attempt.service';
import { TokenBlacklistService } from './security/token-blacklist.service';
import { SecurityLogService } from '../audit/security-log.service';
import * as bcrypt from 'bcrypt';

describe('ExternalAuthService (Unit Tests)', () => {
  let service: ExternalAuthService;
  let mockExternalUserDomainService: {
    저장: jest.Mock;
    조회: jest.Mock;
    사용자명조회: jest.Mock;
  };
  let mockJwtService: jest.Mocked<JwtService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLoginAttemptService: jest.Mocked<LoginAttemptService>;
  let mockTokenBlacklistService: jest.Mocked<TokenBlacklistService>;

  /**
   * Mock 설정
   */
  beforeEach(async () => {
    mockExternalUserDomainService = {
      저장: jest.fn(),
      조회: jest.fn(),
      사용자명조회: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue('test-external-jwt-secret'),
    } as unknown as jest.Mocked<ConfigService>;

    mockLoginAttemptService = {
      canAttemptLogin: jest.fn().mockReturnValue({ allowed: true, remainingAttempts: 5 }),
      recordFailedAttempt: jest.fn().mockReturnValue({ failedCount: 1, isLocked: false }),
      clearFailedAttempts: jest.fn(),
    } as unknown as jest.Mocked<LoginAttemptService>;

    mockTokenBlacklistService = {
      isBlacklisted: jest.fn().mockReturnValue(false),
      addToBlacklist: jest.fn(),
    } as unknown as jest.Mocked<TokenBlacklistService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalAuthService,
        { provide: ExternalUserDomainService, useValue: mockExternalUserDomainService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoginAttemptService, useValue: mockLoginAttemptService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
        { provide: SecurityLogService, useValue: {
          logLoginSuccess: jest.fn().mockResolvedValue(undefined),
          logLoginFailure: jest.fn().mockResolvedValue(undefined),
          log: jest.fn().mockResolvedValue(undefined),
        }},
      ],
    }).compile();

    service = module.get<ExternalAuthService>(ExternalAuthService);
  });

  /**
   * SC-001: 외부 사용자 로그인 성공
   */
  describe('SC-001: 외부 사용자 로그인 성공', () => {
    /**
     * 검증 목적: 정상적인 로그인 및 JWT 발급
     */
    it('should login successfully and return access/refresh tokens', async () => {
      // GIVEN
      const hashedPassword = await bcrypt.hash('SecureP@ss123!', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-001',
        username: 'external_user_001',
        passwordHash: hashedPassword,
        name: '홍길동',
        email: 'hong@partner.com',
        company: '파트너사 A',
        isActive: true,
        createdBy: 'admin-123',
      });

      mockExternalUserDomainService.사용자명조회.mockResolvedValue(existingUser);
      mockExternalUserDomainService.저장.mockImplementation(async (user) => user);
      mockJwtService.sign
        .mockReturnValueOnce('access-token-jwt')
        .mockReturnValueOnce('refresh-token-jwt');

      // WHEN
      const result = await service.login({
        username: 'external_user_001',
        password: 'SecureP@ss123!',
      });

      // THEN
      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.refreshToken).toBe('refresh-token-jwt');

      expect(result.user).toEqual({
        id: 'ext-user-001',
        username: 'external_user_001',
        name: '홍길동',
        email: 'hong@partner.com',
        company: '파트너사 A',
      });

      // lastLoginAt 갱신을 위해 save 호출됨
      expect(mockExternalUserDomainService.저장).toHaveBeenCalled();

      // 로그인 실패 카운터가 초기화됨
      expect(mockLoginAttemptService.clearFailedAttempts).toHaveBeenCalledWith('external_user_001');

      // JWT 페이로드가 올바름 (보안: userId만 포함, username 제외)
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'ext-user-001',
          type: 'external',
          tokenType: 'access',
        }),
        expect.any(Object),
      );
      // username이 JWT 페이로드에 포함되지 않음
      expect(mockJwtService.sign).not.toHaveBeenCalledWith(
        expect.objectContaining({ username: expect.anything() }),
        expect.any(Object),
      );
    });

    /**
     * 에러 시나리오: 사용자가 존재하지 않음
     */
    it('should throw UnauthorizedException when user not found', async () => {
      mockExternalUserDomainService.사용자명조회.mockResolvedValue(null);

      await expect(
        service.login({ username: 'unknown', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);

      // 실패 기록이 남음
      expect(mockLoginAttemptService.recordFailedAttempt).toHaveBeenCalledWith('unknown');
    });

    /**
     * 에러 시나리오: 비밀번호가 틀림
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
      mockExternalUserDomainService.사용자명조회.mockResolvedValue(existingUser);

      await expect(
        service.login({ username: 'partner_user', password: 'wrong_password' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLoginAttemptService.recordFailedAttempt).toHaveBeenCalled();
    });

    /**
     * 에러 시나리오: 비활성화된 계정
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
      mockExternalUserDomainService.사용자명조회.mockResolvedValue(existingUser);

      await expect(
        service.login({ username: 'partner_user', password: 'correct_password' }),
      ).rejects.toThrow(ForbiddenException);
    });

    /**
     * 에러 시나리오: 계정 잠금 상태
     */
    it('should throw ForbiddenException when account is locked', async () => {
      mockLoginAttemptService.canAttemptLogin.mockReturnValue({
        allowed: false,
        lockRemainingSeconds: 1500,
      });

      await expect(
        service.login({ username: 'locked_user', password: 'any_password' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * SC-002: Access Token 갱신 성공
   */
  describe('SC-002: Access Token 갱신 성공', () => {
    /**
     * 검증 목적: Refresh Token으로 새 Access Token 발급
     */
    it('should refresh access token successfully', async () => {
      // GIVEN
      const refreshTokenPayload = {
        sub: 'ext-user-001',
        username: 'external_user_001',
        type: 'external',
        tokenType: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 604800, // 7일 후
      };

      mockJwtService.verify.mockReturnValue(refreshTokenPayload);
      mockTokenBlacklistService.isBlacklisted.mockReturnValue(false);

      const activeUser = new ExternalUser({
        id: 'ext-user-001',
        username: 'external_user_001',
        isActive: true,
        createdBy: 'admin',
      });
      mockExternalUserDomainService.조회.mockResolvedValue(activeUser);
      mockJwtService.sign.mockReturnValue('new-access-token-jwt');

      // WHEN
      const result = await service.refreshToken({
        refreshToken: 'valid-refresh-token',
      });

      // THEN
      expect(result.accessToken).toBe('new-access-token-jwt');
      expect(result.expiresIn).toBe(900);
      expect(mockTokenBlacklistService.isBlacklisted).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockExternalUserDomainService.조회).toHaveBeenCalledWith('ext-user-001');
    });

    /**
     * 에러 시나리오: 유효하지 않은 Refresh Token
     */
    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        service.refreshToken({ refreshToken: 'invalid-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * 에러 시나리오: 블랙리스트에 등록된 Refresh Token
     */
    it('should throw UnauthorizedException when refresh token is blacklisted', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'ext-user-001',
        type: 'external',
        tokenType: 'refresh',
      });
      mockTokenBlacklistService.isBlacklisted.mockReturnValue(true);

      await expect(
        service.refreshToken({ refreshToken: 'blacklisted-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * 에러 시나리오: 비활성화된 사용자
     */
    it('should throw ForbiddenException when user is deactivated', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'ext-user-001',
        type: 'external',
        tokenType: 'refresh',
      });
      mockTokenBlacklistService.isBlacklisted.mockReturnValue(false);

      const deactivatedUser = new ExternalUser({
        id: 'ext-user-001',
        isActive: false,
        createdBy: 'admin',
      });
      mockExternalUserDomainService.조회.mockResolvedValue(deactivatedUser);

      await expect(
        service.refreshToken({ refreshToken: 'valid-token' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * SC-003: 로그아웃 성공
   */
  describe('SC-003: 로그아웃 성공', () => {
    /**
     * 검증 목적: 토큰을 블랙리스트에 추가하여 무효화
     */
    it('should logout and add token to blacklist', async () => {
      // GIVEN
      const tokenPayload = {
        sub: 'ext-user-001',
        exp: Math.floor(Date.now() / 1000) + 900, // 15분 후
      };
      mockJwtService.verify.mockReturnValue(tokenPayload);

      // WHEN
      await service.logout('valid-access-token', 'ext-user-001');

      // THEN
      expect(mockTokenBlacklistService.addToBlacklist).toHaveBeenCalledWith(
        'valid-access-token',
        'ext-user-001',
        'logout',
        expect.any(Date),
      );
    });

    /**
     * 검증 목적: 이미 만료된 토큰도 로그아웃 성공 처리
     */
    it('should succeed even when token is already expired', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('token expired');
      });

      // 에러가 발생하지 않아야 함
      await expect(
        service.logout('expired-token', 'ext-user-001'),
      ).resolves.toBeUndefined();
    });
  });

  /**
   * SC-004: 비밀번호 변경 성공
   */
  describe('SC-004: 비밀번호 변경 성공', () => {
    /**
     * 검증 목적: 현재 비밀번호 검증 후 새 비밀번호로 변경
     */
    it('should change password successfully', async () => {
      // GIVEN
      const currentHashedPassword = await bcrypt.hash('SecureP@ss123!', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-001',
        username: 'external_user_001',
        passwordHash: currentHashedPassword,
        isActive: true,
        createdBy: 'admin-123',
      });
      mockExternalUserDomainService.조회.mockResolvedValue(existingUser);
      mockExternalUserDomainService.저장.mockImplementation(async (user) => user);

      const tokenPayload = {
        sub: 'ext-user-001',
        exp: Math.floor(Date.now() / 1000) + 900,
      };
      mockJwtService.verify.mockReturnValue(tokenPayload);

      // WHEN
      await service.changePassword(
        'ext-user-001',
        {
          currentPassword: 'SecureP@ss123!',
          newPassword: 'NewSecureP@ss456!',
        },
        'current-access-token',
      );

      // THEN
      // DB에서 passwordHash가 변경됨
      expect(mockExternalUserDomainService.저장).toHaveBeenCalled();
      const savedUser = mockExternalUserDomainService.저장.mock.calls[0][0];
      expect(savedUser.passwordHash).not.toBe(currentHashedPassword);

      // 새 비밀번호가 해시됨 (평문이 아님)
      expect(savedUser.passwordHash).not.toBe('NewSecureP@ss456!');

      // 기존 Access Token이 블랙리스트에 추가됨
      expect(mockTokenBlacklistService.addToBlacklist).toHaveBeenCalledWith(
        'current-access-token',
        'ext-user-001',
        'password_change',
        expect.any(Date),
      );
    });

    /**
     * 에러 시나리오: 현재 비밀번호가 틀림
     */
    it('should throw UnauthorizedException when current password is incorrect', async () => {
      const currentHashedPassword = await bcrypt.hash('correct_password', 10);
      const existingUser = new ExternalUser({
        id: 'ext-user-123',
        username: 'partner_user',
        passwordHash: currentHashedPassword,
        isActive: true,
        createdBy: 'admin-123',
      });
      mockExternalUserDomainService.조회.mockResolvedValue(existingUser);

      await expect(
        service.changePassword('ext-user-123', {
          currentPassword: 'wrong_password',
          newPassword: 'new_password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * 에러 시나리오: 사용자를 찾을 수 없음
     */
    it('should throw UnauthorizedException when user not found', async () => {
      mockExternalUserDomainService.조회.mockResolvedValue(null);

      await expect(
        service.changePassword('unknown-user', {
          currentPassword: 'any',
          newPassword: 'any',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * 검증 목적: 새 비밀번호로 로그인 가능한지 확인
     */
    it('should allow login with new password after change', async () => {
      // 1. 비밀번호 변경
      const originalPassword = 'SecureP@ss123!';
      const newPassword = 'NewSecureP@ss456!';
      const originalHashedPassword = await bcrypt.hash(originalPassword, 10);

      const user = new ExternalUser({
        id: 'ext-user-001',
        username: 'external_user_001',
        passwordHash: originalHashedPassword,
        name: '홍길동',
        email: 'hong@partner.com',
        isActive: true,
        createdBy: 'admin',
      });

      mockExternalUserDomainService.조회.mockResolvedValue(user);
      mockExternalUserDomainService.저장.mockImplementation(async (u) => u);
      mockJwtService.verify.mockReturnValue({ sub: 'ext-user-001', exp: Date.now() / 1000 + 900 });

      await service.changePassword('ext-user-001', {
        currentPassword: originalPassword,
        newPassword: newPassword,
      });

      // 2. 새 비밀번호로 로그인 시도
      const savedUser = mockExternalUserDomainService.저장.mock.calls[0][0];
      const isNewPasswordValid = await bcrypt.compare(newPassword, savedUser.passwordHash);
      expect(isNewPasswordValid).toBe(true);

      // 3. 이전 비밀번호로 로그인 불가
      const isOldPasswordValid = await bcrypt.compare(originalPassword, savedUser.passwordHash);
      expect(isOldPasswordValid).toBe(false);
    });
  });
});
