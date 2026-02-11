/**
 * ============================================================
 * 📦 PublicShareManagementService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - PublicShareManagementService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 내부 사용자가 외부 사용자에게 파일 공유 생성
 *   - 관리자가 공유 차단/해제, 일괄 차단 기능 제공
 *   - 공유된 파일 통계 조회
 *
 * ⚠️ 중요 고려사항:
 *   - 파일 존재 여부 검증
 *   - 외부 사용자 존재 여부 검증
 *   - 중복 공유 방지
 *   - 소유자만 취소 가능
 * ============================================================
 */
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-public-share-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { PublicShareManagementService } from './public-share-management.service';
import {
  PUBLIC_SHARE_REPOSITORY,
  IPublicShareRepository,
} from '../../domain/external-share/repositories/public-share.repository.interface';
import {
  FILE_REPOSITORY,
  IFileRepository,
} from '../../domain/file/repositories/file.repository.interface';
import {
  ExternalUserDomainService,
  PublicShareDomainService as DomainPublicShareDomainService,
} from '../../domain/external-share';
import { FileDomainService } from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import { PublicShareDomainService } from './public-share-domain.service';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import { ExternalUser } from '../../domain/external-share/entities/external-user.entity';
import { SharePermission } from '../../domain/external-share/type/public-share.type';

describe('PublicShareManagementService', () => {
  let service: PublicShareManagementService;
  let mockShareRepo: jest.Mocked<IPublicShareRepository>;
  let mockExternalUserService: { 조회: jest.Mock };
  let mockFileRepo: { findById: jest.Mock; findByIds: jest.Mock };

  /**
   * 🎭 Mock 설정
   * 📍 mockShareRepo: PublicShare 영속성 관리
   * 📍 mockExternalUserService: ExternalUser 조회 (Employee 기반)
   * 📍 mockFileRepo: File 존재 확인
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

    mockExternalUserService = {
      조회: jest.fn(),
    };

    mockFileRepo = {
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicShareManagementService,
        PublicShareDomainService,
        DomainPublicShareDomainService,
        {
          provide: PUBLIC_SHARE_REPOSITORY,
          useValue: mockShareRepo,
        },
        {
          provide: ExternalUserDomainService,
          useValue: mockExternalUserService,
        },
        FileDomainService,
        {
          provide: FILE_REPOSITORY,
          useValue: mockFileRepo,
        },
      ],
    }).compile();

    service = module.get<PublicShareManagementService>(
      PublicShareManagementService,
    );
  });

  /**
   * 📌 테스트 시나리오: 외부 공유 생성 (createPublicShare)
   */
  describe('createPublicShare', () => {
    const createShareDto = {
      fileId: 'file-123',
      externalUserId: 'ext-user-456',
      permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
      maxViewCount: 10,
      maxDownloadCount: 5,
      expiresAt: new Date('2026-02-01'),
    };

    /**
     * 🎯 검증 목적: 정상적인 공유 생성
     */
    it('should create a public share successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFileRepo.findById.mockResolvedValue({
        id: 'file-123',
        state: FileState.ACTIVE,
      });
      mockExternalUserService.조회.mockResolvedValue(
        new ExternalUser({
          id: 'ext-user-456',
          username: 'partner',
          isActive: true,
          createdBy: 'admin',
        }),
      );
      mockShareRepo.findByFileAndExternalUser.mockResolvedValue(null);
      mockShareRepo.save.mockImplementation(async (share) => share);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.createPublicShare('owner-123', createShareDto);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockFileRepo.findById).toHaveBeenCalledWith('file-123', undefined);
      expect(mockExternalUserService.조회).toHaveBeenCalledWith('ext-user-456');
      expect(mockShareRepo.save).toHaveBeenCalled();
      expect(result.fileId).toBe('file-123');
      expect(result.ownerId).toBe('owner-123');
      expect(result.externalUserId).toBe('ext-user-456');
      expect(result.maxViewCount).toBe(10);
      expect(result.maxDownloadCount).toBe(5);
    });

    /**
     * 🎯 검증 목적: 파일이 존재하지 않으면 BusinessException (PUBLIC_SHARE_FILE_NOT_FOUND)
     */
    it('should throw BusinessException when file does not exist', async () => {
      mockFileRepo.findById.mockResolvedValue(null);

      await expect(
        service.createPublicShare('owner-123', createShareDto),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.PUBLIC_SHARE_FILE_NOT_FOUND.code,
      });
    });

    /**
     * 🎯 검증 목적: 외부 사용자가 존재하지 않으면 BusinessException (PUBLIC_SHARE_TARGET_NOT_FOUND)
     */
    it('should throw BusinessException when external user does not exist', async () => {
      mockFileRepo.findById.mockResolvedValue({
        id: 'file-123',
        state: FileState.ACTIVE,
      });
      mockExternalUserService.조회.mockResolvedValue(null);

      await expect(
        service.createPublicShare('owner-123', createShareDto),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.PUBLIC_SHARE_TARGET_NOT_FOUND.code,
      });
    });

    /**
     * 🎯 검증 목적: 중복 공유 시 BusinessException (PUBLIC_SHARE_DUPLICATE)
     */
    it('should throw BusinessException when share already exists', async () => {
      mockFileRepo.findById.mockResolvedValue({
        id: 'file-123',
        state: FileState.ACTIVE,
      });
      mockExternalUserService.조회.mockResolvedValue(
        new ExternalUser({ id: 'ext-user-456', isActive: true, createdBy: 'admin' }),
      );
      mockShareRepo.findByFileAndExternalUser.mockResolvedValue(
        new PublicShare({
          id: 'existing-share',
          fileId: 'file-123',
          externalUserId: 'ext-user-456',
          ownerId: 'owner',
        }),
      );

      await expect(
        service.createPublicShare('owner-123', createShareDto),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.PUBLIC_SHARE_DUPLICATE.code,
      });
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 취소 (revokeShare)
   */
  describe('revokeShare', () => {
    /**
     * 🎯 검증 목적: 정상적인 공유 취소
     */
    it('should revoke share successfully', async () => {
      const existingShare = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-123',
        externalUserId: 'ext-user-789',
        isRevoked: false,
      });
      mockShareRepo.findById.mockResolvedValue(existingShare);
      mockShareRepo.save.mockImplementation(async (share) => share);

      const result = await service.revokeShare('owner-123', 'share-123');

      expect(result.isRevoked).toBe(true);
      expect(mockShareRepo.save).toHaveBeenCalled();
    });

    /**
     * 🎯 검증 목적: 소유자가 아니면 BusinessException (PUBLIC_SHARE_NOT_OWNER)
     */
    it('should throw BusinessException when user is not owner', async () => {
      const existingShare = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'other-owner',
        externalUserId: 'ext-user-789',
      });
      mockShareRepo.findById.mockResolvedValue(existingShare);

      await expect(
        service.revokeShare('owner-123', 'share-123'),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.PUBLIC_SHARE_NOT_OWNER.code,
      });
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 BusinessException (PUBLIC_SHARE_NOT_FOUND)
     */
    it('should throw BusinessException when share does not exist', async () => {
      mockShareRepo.findById.mockResolvedValue(null);

      await expect(
        service.revokeShare('owner-123', 'non-existent'),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.PUBLIC_SHARE_NOT_FOUND.code,
      });
    });
  });

  /**
   * 📌 테스트 시나리오: 내가 생성한 공유 목록 (getMyPublicShares)
   */
  describe('getMyPublicShares', () => {
    /**
     * 🎯 검증 목적: 페이지네이션 적용된 목록 반환
     */
    it('should return paginated shares created by owner', async () => {
      const shares = [
        new PublicShare({ id: 'share-1', ownerId: 'owner-123', fileId: 'f1', externalUserId: 'e1' }),
        new PublicShare({ id: 'share-2', ownerId: 'owner-123', fileId: 'f2', externalUserId: 'e2' }),
      ];
      mockShareRepo.findByOwner.mockResolvedValue({
        items: shares,
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });

      const result = await service.getMyPublicShares('owner-123', {
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(2);
      expect(mockShareRepo.findByOwner).toHaveBeenCalledWith('owner-123', {
        page: 1,
        pageSize: 20,
      });
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 차단 (blockShare) - 관리자용
   */
  describe('blockShare', () => {
    /**
     * 🎯 검증 목적: 정상적인 차단
     */
    it('should block share successfully', async () => {
      const existingShare = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user',
        isBlocked: false,
      });
      mockShareRepo.findById.mockResolvedValue(existingShare);
      mockShareRepo.save.mockImplementation(async (share) => share);

      const result = await service.blockShare('admin-123', 'share-123');

      expect(result.isBlocked).toBe(true);
      expect(result.blockedBy).toBe('admin-123');
      expect(result.blockedAt).toBeDefined();
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 BusinessException (PUBLIC_SHARE_NOT_FOUND)
     */
    it('should throw BusinessException when share does not exist', async () => {
      mockShareRepo.findById.mockResolvedValue(null);

      await expect(service.blockShare('admin-123', 'non-existent')).rejects.toMatchObject({
        errorCode: ErrorCodes.PUBLIC_SHARE_NOT_FOUND.code,
      });
    });
  });

  /**
   * 📌 테스트 시나리오: 차단 해제 (unblockShare) - 관리자용
   */
  describe('unblockShare', () => {
    /**
     * 🎯 검증 목적: 정상적인 차단 해제
     */
    it('should unblock share successfully', async () => {
      const existingShare = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user',
        isBlocked: true,
        blockedBy: 'admin-123',
        blockedAt: new Date(),
      });
      mockShareRepo.findById.mockResolvedValue(existingShare);
      mockShareRepo.save.mockImplementation(async (share) => share);

      const result = await service.unblockShare('share-123');

      expect(result.isBlocked).toBe(false);
      expect(result.blockedBy).toBeUndefined();
      expect(result.blockedAt).toBeUndefined();
    });
  });

  /**
   * 📌 테스트 시나리오: 파일별 일괄 차단 (blockAllSharesByFile)
   */
  describe('blockAllSharesByFile', () => {
    /**
     * 🎯 검증 목적: 특정 파일의 모든 공유 일괄 차단
     */
    it('should block all shares of a file', async () => {
      mockShareRepo.blockAllByFileId.mockResolvedValue(15);

      const result = await service.blockAllSharesByFile('admin-123', 'file-456');

      expect(result.blockedCount).toBe(15);
      expect(mockShareRepo.blockAllByFileId).toHaveBeenCalledWith(
        'file-456',
        'admin-123',
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 파일별 일괄 차단 해제 (unblockAllSharesByFile)
   */
  describe('unblockAllSharesByFile', () => {
    /**
     * 🎯 검증 목적: 특정 파일의 모든 공유 일괄 차단 해제
     */
    it('should unblock all shares of a file', async () => {
      mockShareRepo.unblockAllByFileId.mockResolvedValue(10);

      const result = await service.unblockAllSharesByFile('file-456');

      expect(result.unblockedCount).toBe(10);
      expect(mockShareRepo.unblockAllByFileId).toHaveBeenCalledWith('file-456');
    });
  });

  /**
   * 📌 테스트 시나리오: 외부 사용자별 일괄 차단 (blockAllSharesByExternalUser)
   */
  describe('blockAllSharesByExternalUser', () => {
    /**
     * 🎯 검증 목적: 특정 외부 사용자의 모든 공유 일괄 차단
     */
    it('should block all shares of an external user', async () => {
      mockExternalUserService.조회.mockResolvedValue(
        new ExternalUser({ id: 'ext-user-456', isActive: true, createdBy: 'admin' }),
      );
      mockShareRepo.blockAllByExternalUserId.mockResolvedValue(8);

      const result = await service.blockAllSharesByExternalUser(
        'admin-123',
        'ext-user-456',
      );

      expect(result.blockedCount).toBe(8);
      expect(mockShareRepo.blockAllByExternalUserId).toHaveBeenCalledWith(
        'ext-user-456',
        'admin-123',
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 전체 공유 현황 (getAllPublicShares)
   */
  describe('getAllPublicShares', () => {
    /**
     * 🎯 검증 목적: 관리자용 전체 공유 목록 반환
     */
    it('should return all public shares with pagination', async () => {
      const shares = [
        new PublicShare({ id: 's1', fileId: 'f1', ownerId: 'o1', externalUserId: 'e1' }),
        new PublicShare({ id: 's2', fileId: 'f2', ownerId: 'o2', externalUserId: 'e2' }),
      ];
      mockShareRepo.findAll.mockResolvedValue({
        items: shares,
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });

      const result = await service.getAllPublicShares({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(2);
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 상세 조회 (getPublicShareById)
   */
  describe('getPublicShareById', () => {
    /**
     * 🎯 검증 목적: 정상 조회
     */
    it('should return public share by id', async () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner',
        externalUserId: 'ext-user',
      });
      mockShareRepo.findById.mockResolvedValue(share);

      const result = await service.getPublicShareById('share-123');

      expect(result.id).toBe('share-123');
    });

    /**
     * 🎯 검증 목적: 존재하지 않으면 BusinessException (PUBLIC_SHARE_NOT_FOUND)
     */
    it('should throw BusinessException when share does not exist', async () => {
      mockShareRepo.findById.mockResolvedValue(null);

      await expect(service.getPublicShareById('non-existent')).rejects.toMatchObject({
        errorCode: ErrorCodes.PUBLIC_SHARE_NOT_FOUND.code,
      });
    });
  });

  /**
   * 📌 테스트 시나리오: 특정 파일의 공유 목록 (getSharesByFileId)
   */
  describe('getSharesByFileId', () => {
    it('should return all shares for a file', async () => {
      const shares = [
        new PublicShare({ id: 's1', fileId: 'file-123', ownerId: 'o1', externalUserId: 'e1' }),
        new PublicShare({ id: 's2', fileId: 'file-123', ownerId: 'o2', externalUserId: 'e2' }),
      ];
      mockShareRepo.findByFileId.mockResolvedValue(shares);

      const result = await service.getSharesByFileId('file-123');

      expect(result).toHaveLength(2);
    });
  });
});
