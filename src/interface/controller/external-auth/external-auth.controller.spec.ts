/**
 * ============================================================
 * 📦 ExternalAuthController 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalAuthController 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 외부 사용자 인증 (로그인/로그아웃)
 *   - 비밀번호 변경
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ExternalAuthController } from './external-auth.controller';
import { ExternalAuthService } from '../../../business/external-share/external-auth.service';

describe('ExternalAuthController', () => {
  let controller: ExternalAuthController;
  let mockAuthService: jest.Mocked<ExternalAuthService>;

  beforeEach(async () => {
    mockAuthService = {
      login: jest.fn(),
      changePassword: jest.fn(),
    } as unknown as jest.Mocked<ExternalAuthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalAuthController],
      providers: [
        {
          provide: ExternalAuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<ExternalAuthController>(ExternalAuthController);
  });

  describe('POST /v1/ext-auth/login', () => {
    it('should login and return JWT token', async () => {
      const dto = { username: 'partner', password: 'password123' };
      const loginResult = {
        accessToken: 'mock-jwt-token',
        user: {
          id: 'user-123',
          username: 'partner',
          name: '홍길동',
          email: 'hong@partner.com',
        },
      };
      mockAuthService.login.mockResolvedValue(loginResult);

      const result = await controller.login(dto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.username).toBe('partner');
    });
  });

  describe('POST /v1/ext-auth/logout', () => {
    it('should return logout message', async () => {
      const result = await controller.logout();

      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('PATCH /v1/ext-auth/change-password', () => {
    it('should change password', async () => {
      const dto = {
        currentPassword: 'oldpass',
        newPassword: 'newpass',
      };
      const user = { id: 'user-123' };
      mockAuthService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword(user, dto);

      expect(result.message).toBe('Password changed successfully');
      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        'user-123',
        dto,
      );
    });
  });
});
