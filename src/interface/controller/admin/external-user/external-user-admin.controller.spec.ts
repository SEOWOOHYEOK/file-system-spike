/**
 * ============================================================
 * 📦 ExternalUserAdminController 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalUserAdminController 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 관리자가 외부 사용자 계정을 관리
 *   - CRUD 및 활성화/비활성화 기능
 * ============================================================
 */
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExternalUserAdminController } from './external-user-admin.controller';
import { ExternalUserManagementService } from '../../../../business/external-share/external-user-management.service';
import { ExternalUser } from '../../../../domain/external-share/entities/external-user.entity';

describe('ExternalUserAdminController', () => {
  let controller: ExternalUserAdminController;
  let mockUserService: jest.Mocked<ExternalUserManagementService>;

  beforeEach(async () => {
    mockUserService = {
      createExternalUser: jest.fn(),
      updateExternalUser: jest.fn(),
      deactivateUser: jest.fn(),
      activateUser: jest.fn(),
      resetPassword: jest.fn(),
      getExternalUsers: jest.fn(),
      getExternalUserById: jest.fn(),
    } as unknown as jest.Mocked<ExternalUserManagementService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalUserAdminController],
      providers: [
        {
          provide: ExternalUserManagementService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<ExternalUserAdminController>(
      ExternalUserAdminController,
    );
  });

  describe('POST /v1/admin/external-users', () => {
    it('should create an external user', async () => {
      const dto = {
        username: 'partner',
        password: 'password123',
        name: '홍길동',
        email: 'hong@partner.com',
      };
      const user = { id: 'admin-123' };
      const createdUser = new ExternalUser({
        id: 'new-user-id',
        username: 'partner',
        name: '홍길동',
        createdBy: 'admin-123',
      });
      mockUserService.createExternalUser.mockResolvedValue(createdUser);

      const result = await controller.createExternalUser(user, dto);

      expect(result.id).toBe('new-user-id');
      expect(mockUserService.createExternalUser).toHaveBeenCalledWith(
        'admin-123',
        dto,
      );
    });
  });

  describe('GET /v1/admin/external-users', () => {
    it('should return paginated external users', async () => {
      const paginatedResult = {
        items: [new ExternalUser({ id: 'user-1', createdBy: 'admin' })],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      };
      mockUserService.getExternalUsers.mockResolvedValue(paginatedResult);

      const result = await controller.getExternalUsers(1, 20);

      expect(result.items).toHaveLength(1);
    });
  });

  describe('GET /v1/admin/external-users/:id', () => {
    it('should return external user by id', async () => {
      const user = new ExternalUser({
        id: 'user-123',
        username: 'partner',
        createdBy: 'admin',
      });
      mockUserService.getExternalUserById.mockResolvedValue(user);

      const result = await controller.getExternalUserById('user-123');

      expect(result.id).toBe('user-123');
    });
  });

  describe('PATCH /v1/admin/external-users/:id', () => {
    it('should update external user', async () => {
      const dto = { name: '김철수' };
      const updatedUser = new ExternalUser({
        id: 'user-123',
        name: '김철수',
        createdBy: 'admin',
      });
      mockUserService.updateExternalUser.mockResolvedValue(updatedUser);

      const result = await controller.updateExternalUser('user-123', dto);

      expect(result.name).toBe('김철수');
    });
  });

  describe('PATCH /v1/admin/external-users/:id/deactivate', () => {
    it('should deactivate user', async () => {
      const deactivatedUser = new ExternalUser({
        id: 'user-123',
        isActive: false,
        createdBy: 'admin',
      });
      mockUserService.deactivateUser.mockResolvedValue(deactivatedUser);

      const result = await controller.deactivateUser('user-123');

      expect(result.isActive).toBe(false);
    });
  });

  describe('PATCH /v1/admin/external-users/:id/activate', () => {
    it('should activate user', async () => {
      const activatedUser = new ExternalUser({
        id: 'user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockUserService.activateUser.mockResolvedValue(activatedUser);

      const result = await controller.activateUser('user-123');

      expect(result.isActive).toBe(true);
    });
  });

  describe('POST /v1/admin/external-users/:id/reset-password', () => {
    it('should reset password and return temporary password', async () => {
      mockUserService.resetPassword.mockResolvedValue({
        temporaryPassword: 'temp123456',
      });

      const result = await controller.resetPassword('user-123');

      expect(result.temporaryPassword).toBe('temp123456');
    });
  });
});
