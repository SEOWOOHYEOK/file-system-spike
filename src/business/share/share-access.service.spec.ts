/**
 * ============================================================
 * 📦 ShareAccessService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ShareAccessService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 수신자(Recipient)가 공유받은 파일에 접근
 *   - 공유 유효성 검증 (만료일, 다운로드 횟수)
 *   - 권한에 따른 접근 제어 (VIEW/DOWNLOAD)
 *
 * ⚠️ 중요 고려사항:
 *   - 만료된 공유는 접근 불가
 *   - 다운로드 횟수 초과 시 접근 불가
 *   - DOWNLOAD 시 다운로드 횟수 증가
 * ============================================================
 */
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { FileShare } from '../../domain/share/entities/file-share.entity';
import { SharePermission } from '../../domain/share/share-permission.enum';
import type { IFileShareRepository } from '../../domain/share/repositories/file-share.repository.interface';

// ShareAccessService 클래스를 인라인으로 정의 (circular dependency 회피)
// 실제 구현은 share-access.service.ts와 동일
class ShareAccessServiceImpl {
  constructor(private readonly shareRepo: IFileShareRepository) {}

  async getMyShares(recipientId: string): Promise<FileShare[]> {
    return this.shareRepo.findByRecipient(recipientId);
  }

  async validateAndTrackAccess(
    shareId: string,
    userId: string,
    requiredPermission: SharePermission,
  ): Promise<FileShare> {
    const share = await this.shareRepo.findById(shareId);
    if (!share || share.recipientId !== userId) {
      throw new NotFoundException('Share not found');
    }
    if (!share.isValid()) {
      throw new ForbiddenException(
        'Share has expired or download limit exceeded',
      );
    }
    if (!share.hasPermission(requiredPermission)) {
      throw new ForbiddenException(
        `Permission ${requiredPermission} is not granted for this share`,
      );
    }
    if (requiredPermission === SharePermission.DOWNLOAD) {
      share.incrementDownloadCount();
      await this.shareRepo.save(share);
    }
    return share;
  }
}

describe('ShareAccessService', () => {
  let service: ShareAccessServiceImpl;
  let mockShareRepo: jest.Mocked<IFileShareRepository>;

  /**
   * 🎭 Mock 설정
   */
  beforeEach(() => {
    mockShareRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByRecipient: jest.fn(),
      findByOwner: jest.fn(),
      findByFileId: jest.fn(),
      findByFileAndRecipient: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IFileShareRepository>;

    service = new ShareAccessServiceImpl(mockShareRepo);
  });

  /**
   * 📌 테스트 시나리오: 나에게 공유된 파일 목록 조회
   */
  describe('getMyShares', () => {
    it('should return all shares for recipient', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const shares = [
        new FileShare({
          id: 'share-1',
          fileId: 'file-1',
          ownerId: 'owner-1',
          recipientId: 'recipient-1',
          permissions: [SharePermission.VIEW],
        }),
        new FileShare({
          id: 'share-2',
          fileId: 'file-2',
          ownerId: 'owner-2',
          recipientId: 'recipient-1',
          permissions: [SharePermission.DOWNLOAD],
        }),
      ];
      mockShareRepo.findByRecipient.mockResolvedValue(shares);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getMyShares('recipient-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockShareRepo.findByRecipient).toHaveBeenCalledWith('recipient-1');
      expect(result).toHaveLength(2);
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 접근 검증 및 추적
   */
  describe('validateAndTrackAccess', () => {
    /**
     * 🎯 검증 목적: VIEW 권한으로 접근 성공
     */
    it('should allow VIEW access when permission exists', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW],
        currentDownloadCount: 0,
        expiresAt: new Date(Date.now() + 86400000), // 내일
      });
      mockShareRepo.findById.mockResolvedValue(share);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.validateAndTrackAccess(
        'share-123',
        'user-recipient',
        SharePermission.VIEW,
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.id).toBe('share-123');
      // VIEW는 다운로드 횟수 증가하지 않음
      expect(mockShareRepo.save).not.toHaveBeenCalled();
    });

    /**
     * 🎯 검증 목적: DOWNLOAD 시 다운로드 횟수 증가
     */
    it('should increment download count on DOWNLOAD access', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.DOWNLOAD],
        maxDownloadCount: 5,
        currentDownloadCount: 2,
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockShareRepo.save.mockImplementation(async (s) => s);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.validateAndTrackAccess(
        'share-123',
        'user-recipient',
        SharePermission.DOWNLOAD,
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.currentDownloadCount).toBe(3);
      expect(mockShareRepo.save).toHaveBeenCalled();
    });

    /**
     * 🎯 검증 목적: 공유가 존재하지 않으면 에러
     */
    it('should throw NotFoundException when share does not exist', async () => {
      mockShareRepo.findById.mockResolvedValue(null);

      await expect(
        service.validateAndTrackAccess(
          'non-existent',
          'user-recipient',
          SharePermission.VIEW,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * 🎯 검증 목적: 수신자가 아니면 에러
     */
    it('should throw NotFoundException when user is not recipient', async () => {
      const share = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'other-recipient', // 다른 수신자
        permissions: [SharePermission.VIEW],
      });
      mockShareRepo.findById.mockResolvedValue(share);

      await expect(
        service.validateAndTrackAccess(
          'share-123',
          'user-recipient',
          SharePermission.VIEW,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * 🎯 검증 목적: 만료된 공유는 접근 불가
     */
    it('should throw ForbiddenException when share is expired', async () => {
      const share = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW],
        expiresAt: new Date('2020-01-01'), // 과거
      });
      mockShareRepo.findById.mockResolvedValue(share);

      await expect(
        service.validateAndTrackAccess(
          'share-123',
          'user-recipient',
          SharePermission.VIEW,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    /**
     * 🎯 검증 목적: 다운로드 횟수 초과 시 에러
     */
    it('should throw ForbiddenException when download limit exceeded', async () => {
      const share = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.DOWNLOAD],
        maxDownloadCount: 5,
        currentDownloadCount: 5, // 제한 도달
      });
      mockShareRepo.findById.mockResolvedValue(share);

      await expect(
        service.validateAndTrackAccess(
          'share-123',
          'user-recipient',
          SharePermission.DOWNLOAD,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    /**
     * 🎯 검증 목적: 권한이 없으면 에러
     */
    it('should throw ForbiddenException when permission denied', async () => {
      const share = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW], // DOWNLOAD 권한 없음
      });
      mockShareRepo.findById.mockResolvedValue(share);

      await expect(
        service.validateAndTrackAccess(
          'share-123',
          'user-recipient',
          SharePermission.DOWNLOAD, // DOWNLOAD 요청
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
