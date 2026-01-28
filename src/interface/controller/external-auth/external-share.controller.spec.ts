/**
 * ============================================================
 * 📦 ExternalShareController 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalShareController 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 외부 사용자의 공유 파일 접근
 *   - 일회성 토큰 기반 콘텐츠 접근
 * ============================================================
 */
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { ExternalShareController } from './external-share.controller';
import { ExternalShareAccessService } from '../../../business/external-share/external-share-access.service';
import { PublicShare } from '../../../domain/external-share/entities/public-share.entity';

describe('ExternalShareController', () => {
  let controller: ExternalShareController;
  let mockAccessService: jest.Mocked<ExternalShareAccessService>;

  beforeEach(async () => {
    mockAccessService = {
      getMyShares: jest.fn(),
      getShareDetail: jest.fn(),
      accessContent: jest.fn(),
    } as unknown as jest.Mocked<ExternalShareAccessService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalShareController],
      providers: [
        {
          provide: ExternalShareAccessService,
          useValue: mockAccessService,
        },
      ],
    }).compile();

    controller = module.get<ExternalShareController>(ExternalShareController);
  });

  describe('GET /v1/ext/shares', () => {
    it('should return shares for external user', async () => {
      const user = { id: 'ext-user-123' };
      const paginatedResult = {
        items: [
          new PublicShare({
            id: 'share-1',
            fileId: 'file-1',
            ownerId: 'owner',
            externalUserId: 'ext-user-123',
          }),
        ],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      };
      mockAccessService.getMyShares.mockResolvedValue(paginatedResult);

      const result = await controller.getMyShares(user, 1, 20);

      expect(result.items).toHaveLength(1);
    });
  });

  describe('GET /v1/ext/shares/:shareId', () => {
    it('should return share detail with content token', async () => {
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });
      mockAccessService.getShareDetail.mockResolvedValue({
        share,
        contentToken: 'token-abc',
      });

      const result = await controller.getShareDetail(user, 'share-123');

      expect(result.share.id).toBe('share-123');
      expect(result.contentToken).toBe('token-abc');
    });
  });

  describe('GET /v1/ext/shares/:shareId/content', () => {
    it('should return file content for VIEW action', async () => {
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
      });

      const mockRes = {
        set: jest.fn(),
        send: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.getContent(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      expect(mockAccessService.accessContent).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalled();
    });
  });

  describe('GET /v1/ext/shares/:shareId/download', () => {
    it('should return file for DOWNLOAD action', async () => {
      const user = { id: 'ext-user-123' };
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
      });
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share,
      });

      const mockRes = {
        set: jest.fn(),
        send: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.downloadFile(
        user,
        'share-123',
        'token-abc',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      expect(mockAccessService.accessContent).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Disposition': 'attachment',
        }),
      );
    });
  });
});
