/**
 * ============================================================
 * 📦 ExternalShareAccessService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalShareAccessService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 외부 사용자가 공유된 파일에 접근
 *   - 일회성 콘텐츠 토큰 발급 및 검증
 *   - 6단계 접근 검증 플로우
 *   - 접근 로그 기록
 *
 * ⚠️ 중요 고려사항:
 *   - 토큰은 1회 사용 후 폐기
 *   - 차단/취소/만료된 공유는 접근 불가
 *   - 뷰/다운로드 횟수 제한 검증
 *   - 모든 접근 시도는 로그 기록
 * ============================================================
 */
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-token-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExternalShareAccessService } from './external-share-access.service';
import {
  PUBLIC_SHARE_REPOSITORY,
  IPublicShareRepository,
} from '../../domain/external-share/repositories/public-share.repository.interface';
import {
  EXTERNAL_USER_REPOSITORY,
  IExternalUserRepository,
} from '../../domain/external-share/repositories/external-user.repository.interface';
import {
  SHARE_ACCESS_LOG_REPOSITORY,
  IShareAccessLogRepository,
} from '../../domain/external-share/repositories/share-access-log.repository.interface';
import {
  CONTENT_TOKEN_STORE,
  IContentTokenStore,
} from '../../domain/external-share/ports/content-token-store.port';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import { ExternalUser } from '../../domain/external-share/entities/external-user.entity';
import { SharePermission } from '../../domain/external-share/type/public-share.type';
import { AccessAction } from '../../domain/external-share/entities/share-access-log.entity';

// TokenStore mock
const mockTokenStore: jest.Mocked<IContentTokenStore> = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

describe('ExternalShareAccessService', () => {
  let service: ExternalShareAccessService;
  let mockShareRepo: jest.Mocked<IPublicShareRepository>;
  let mockUserRepo: jest.Mocked<Partial<IExternalUserRepository>>;
  let mockLogRepo: jest.Mocked<IShareAccessLogRepository>;

  /**
   * 🎭 Mock 설정
   * 📍 mockShareRepo: PublicShare 영속성 관리
   * 📍 mockUserRepo: ExternalUser 상태 확인
   * 📍 mockLogRepo: 접근 로그 저장
   * 📍 mockTokenStore: 일회성 토큰 관리
   */
  beforeEach(async () => {
    mockShareRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByExternalUser: jest.fn(),
      findByOwner: jest.fn(),
      findByFileId: jest.fn(),
      findByFileAndExternalUser: jest.fn(),
      findAll: jest.fn(),
      blockAllByFileId: jest.fn(),
      unblockAllByFileId: jest.fn(),
      blockAllByExternalUserId: jest.fn(),
      getSharedFilesStats: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IPublicShareRepository>;

    mockUserRepo = {
      findById: jest.fn(),
    } as jest.Mocked<Partial<IExternalUserRepository>>;

    mockLogRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByShareId: jest.fn(),
      findByExternalUserId: jest.fn(),
      findAll: jest.fn(),
    } as jest.Mocked<IShareAccessLogRepository>;

    // Reset tokenStore mocks
    mockTokenStore.set.mockReset();
    mockTokenStore.get.mockReset();
    mockTokenStore.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalShareAccessService,
        {
          provide: PUBLIC_SHARE_REPOSITORY,
          useValue: mockShareRepo,
        },
        {
          provide: EXTERNAL_USER_REPOSITORY,
          useValue: mockUserRepo,
        },
        {
          provide: SHARE_ACCESS_LOG_REPOSITORY,
          useValue: mockLogRepo,
        },
        {
          provide: CONTENT_TOKEN_STORE,
          useValue: mockTokenStore,
        },
      ],
    }).compile();

    service = module.get<ExternalShareAccessService>(ExternalShareAccessService);
  });

  /**
   * 📌 테스트 시나리오: 나에게 공유된 파일 목록 (getMyShares)
   */
  describe('getMyShares', () => {
    /**
     * 🎯 검증 목적: 외부 사용자에게 공유된 파일 목록 반환
     */
    it('should return shares for external user', async () => {
      const shares = [
        new PublicShare({
          id: 'share-1',
          fileId: 'file-1',
          ownerId: 'owner-1',
          externalUserId: 'ext-user-123',
          permissions: [SharePermission.VIEW],
        }),
        new PublicShare({
          id: 'share-2',
          fileId: 'file-2',
          ownerId: 'owner-2',
          externalUserId: 'ext-user-123',
          permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
        }),
      ];
      mockShareRepo.findByExternalUser.mockResolvedValue({
        items: shares,
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });

      const result = await service.getMyShares('ext-user-123', {
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(2);
      expect(mockShareRepo.findByExternalUser).toHaveBeenCalledWith(
        'ext-user-123',
        { page: 1, pageSize: 20 },
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 상세 조회 및 토큰 발급 (getShareDetail)
   */
  describe('getShareDetail', () => {
    /**
     * 🎯 검증 목적: 공유 상세 정보와 일회성 토큰 반환
     */
    it('should return share detail with content token', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW],
        isBlocked: false,
        isRevoked: false,
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockTokenStore.set.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getShareDetail('ext-user-123', 'share-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.share.id).toBe('share-123');
      expect(result.contentToken).toBeDefined();
      expect(mockTokenStore.set).toHaveBeenCalled();
    });

    /**
     * 🎯 검증 목적: 본인 공유가 아니면 ForbiddenException
     */
    it('should throw ForbiddenException when not share recipient', async () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-789',
        externalUserId: 'other-ext-user', // 다른 외부 사용자
        isBlocked: false,
        isRevoked: false,
      });
      mockShareRepo.findById.mockResolvedValue(share);

      await expect(
        service.getShareDetail('ext-user-123', 'share-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 NotFoundException
     */
    it('should throw NotFoundException when share does not exist', async () => {
      mockShareRepo.findById.mockResolvedValue(null);

      await expect(
        service.getShareDetail('ext-user-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * 📌 테스트 시나리오: 토큰 검증 및 소비 (validateAndConsumeToken)
   */
  describe('validateAndConsumeToken', () => {
    /**
     * 🎯 검증 목적: 유효한 토큰 검증 및 삭제
     */
    it('should validate and consume token successfully', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({
          shareId: 'share-123',
          permission: 'VIEW',
          used: false,
        }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const result = await service.validateAndConsumeToken('token-abc');

      expect(result.shareId).toBe('share-123');
      expect(result.permission).toBe('VIEW');
      expect(mockTokenStore.del).toHaveBeenCalled();
    });

    /**
     * 🎯 검증 목적: 존재하지 않는 토큰이면 에러
     */
    it('should throw error when token not found', async () => {
      mockTokenStore.get.mockResolvedValue(null);

      await expect(service.validateAndConsumeToken('invalid-token')).rejects.toThrow(
        'INVALID_TOKEN',
      );
    });

    /**
     * 🎯 검증 목적: 이미 사용된 토큰이면 에러
     */
    it('should throw error when token already used', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({
          shareId: 'share-123',
          permission: 'VIEW',
          used: true,
        }),
      );

      await expect(
        service.validateAndConsumeToken('used-token'),
      ).rejects.toThrow('INVALID_TOKEN');
    });
  });

  /**
   * 📌 테스트 시나리오: 콘텐츠 접근 (accessContent) - 6단계 검증
   */
  describe('accessContent', () => {
    const accessParams = {
      externalUserId: 'ext-user-123',
      shareId: 'share-123',
      token: 'valid-token',
      action: AccessAction.VIEW,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      deviceType: 'desktop',
    };

    /**
     * 🎯 검증 목적: 모든 검증 통과 시 성공
     */
    it('should allow access when all validations pass', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      // 1. 토큰 유효
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({
          shareId: 'share-123',
          permission: 'VIEW',
          used: false,
        }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      // 2. 공유 유효 (차단/취소 아님, 만료 아님, 횟수 미초과)
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW],
        maxViewCount: 10,
        currentViewCount: 5,
        isBlocked: false,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000), // 내일
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockShareRepo.save.mockImplementation(async (s) => s);

      // 3. 사용자 활성
      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockUserRepo.findById.mockResolvedValue(user);

      // 로그 저장
      mockLogRepo.save.mockImplementation(async (log) => log);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.accessContent(accessParams);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.success).toBe(true);
      expect(result.share.currentViewCount).toBe(6); // 증가됨
      expect(mockLogRepo.save).toHaveBeenCalled(); // 로그 기록
    });

    /**
     * 🎯 검증 목적: 차단된 공유는 접근 불가
     */
    it('should deny access when share is blocked', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({ shareId: 'share-123', permission: 'VIEW', used: false }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
        isBlocked: true, // 차단됨
        isRevoked: false,
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(
        'SHARE_BLOCKED',
      );
    });

    /**
     * 🎯 검증 목적: 취소된 공유는 접근 불가
     */
    it('should deny access when share is revoked', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({ shareId: 'share-123', permission: 'VIEW', used: false }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
        isBlocked: false,
        isRevoked: true, // 취소됨
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(
        'SHARE_REVOKED',
      );
    });

    /**
     * 🎯 검증 목적: 비활성화된 사용자는 접근 불가
     */
    it('should deny access when user is deactivated', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({ shareId: 'share-123', permission: 'VIEW', used: false }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
        isBlocked: false,
        isRevoked: false,
      });
      mockShareRepo.findById.mockResolvedValue(share);

      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: false, // 비활성화
        createdBy: 'admin',
      });
      mockUserRepo.findById.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(
        'USER_BLOCKED',
      );
    });

    /**
     * 🎯 검증 목적: 만료된 공유는 접근 불가
     */
    it('should deny access when share is expired', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({ shareId: 'share-123', permission: 'VIEW', used: false }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
        isBlocked: false,
        isRevoked: false,
        expiresAt: new Date('2020-01-01'), // 과거
      });
      mockShareRepo.findById.mockResolvedValue(share);

      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockUserRepo.findById.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(
        'SHARE_EXPIRED',
      );
    });

    /**
     * 🎯 검증 목적: 뷰 횟수 초과 시 접근 불가
     */
    it('should deny access when view limit exceeded', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({ shareId: 'share-123', permission: 'VIEW', used: false }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW],
        maxViewCount: 10,
        currentViewCount: 10, // 제한 도달
        isBlocked: false,
        isRevoked: false,
      });
      mockShareRepo.findById.mockResolvedValue(share);

      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockUserRepo.findById.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(
        'LIMIT_EXCEEDED',
      );
    });

    /**
     * 🎯 검증 목적: 권한 없으면 접근 불가
     */
    it('should deny access when permission not granted', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({ shareId: 'share-123', permission: 'DOWNLOAD', used: false }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW], // DOWNLOAD 권한 없음
        isBlocked: false,
        isRevoked: false,
      });
      mockShareRepo.findById.mockResolvedValue(share);

      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockUserRepo.findById.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      const downloadParams = { ...accessParams, action: AccessAction.DOWNLOAD };
      await expect(service.accessContent(downloadParams)).rejects.toThrow(
        'PERMISSION_DENIED',
      );
    });
  });
});
