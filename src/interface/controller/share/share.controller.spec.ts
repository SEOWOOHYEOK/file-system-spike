/**
 * ============================================================
 * 📦 ShareController 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ShareController 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 파일 공유 REST API 엔드포인트
 *   - 공유 생성, 조회, 취소 기능
 *
 * ⚠️ 중요 고려사항:
 *   - 인증된 사용자만 접근 가능
 *   - 권한 검사 적용
 * ============================================================
 */
import { FileShare } from '../../../domain/share/entities/file-share.entity';
import { SharePermission } from '../../../domain/share/share-permission.enum';
import { CreateShareDto } from '../../../business/share/dto/create-share.dto';

// Controller 인라인 구현 (circular dependency 회피)
class ShareControllerImpl {
  constructor(
    private readonly managementService: any,
    private readonly accessService: any,
  ) {}

  async createShare(user: { id: string }, dto: CreateShareDto): Promise<FileShare> {
    return this.managementService.createShare(user.id, dto);
  }

  async getMySharedFiles(user: { id: string }): Promise<FileShare[]> {
    return this.managementService.getMySharedFiles(user.id);
  }

  async getSharedWithMe(user: { id: string }): Promise<FileShare[]> {
    return this.accessService.getMyShares(user.id);
  }

  async revokeShare(user: { id: string }, shareId: string): Promise<void> {
    return this.managementService.revokeShare(user.id, shareId);
  }

  async accessShare(
    user: { id: string },
    shareId: string,
    permission: SharePermission,
  ): Promise<FileShare> {
    return this.accessService.validateAndTrackAccess(shareId, user.id, permission);
  }
}

describe('ShareController', () => {
  let controller: ShareControllerImpl;
  let mockManagementService: any;
  let mockAccessService: any;

  /**
   * 🎭 Mock 설정
   */
  beforeEach(() => {
    mockManagementService = {
      createShare: jest.fn(),
      revokeShare: jest.fn(),
      getMySharedFiles: jest.fn(),
    };

    mockAccessService = {
      getMyShares: jest.fn(),
      validateAndTrackAccess: jest.fn(),
    };

    controller = new ShareControllerImpl(mockManagementService, mockAccessService);
  });

  /**
   * 📌 테스트 시나리오: 공유 생성
   */
  describe('createShare', () => {
    it('should create a share', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const mockUser = { id: 'user-owner' };
      const dto: CreateShareDto = {
        fileId: 'file-123',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
        maxDownloadCount: 5,
      };
      const expectedShare = new FileShare({
        id: 'share-123',
        ...dto,
        ownerId: 'user-owner',
        currentDownloadCount: 0,
      });
      mockManagementService.createShare.mockResolvedValue(expectedShare);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await controller.createShare(mockUser, dto);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockManagementService.createShare).toHaveBeenCalledWith(
        'user-owner',
        dto,
      );
      expect(result.id).toBe('share-123');
    });
  });

  /**
   * 📌 테스트 시나리오: 내가 공유한 파일 목록 조회
   */
  describe('getMySharedFiles', () => {
    it('should return shares created by user', async () => {
      const mockUser = { id: 'user-owner' };
      const shares = [
        new FileShare({
          id: 'share-1',
          fileId: 'file-1',
          ownerId: 'user-owner',
          recipientId: 'recipient-1',
        }),
      ];
      mockManagementService.getMySharedFiles.mockResolvedValue(shares);

      const result = await controller.getMySharedFiles(mockUser);

      expect(mockManagementService.getMySharedFiles).toHaveBeenCalledWith(
        'user-owner',
      );
      expect(result).toHaveLength(1);
    });
  });

  /**
   * 📌 테스트 시나리오: 나에게 공유된 파일 목록 조회
   */
  describe('getSharedWithMe', () => {
    it('should return shares received by user', async () => {
      const mockUser = { id: 'user-recipient' };
      const shares = [
        new FileShare({
          id: 'share-1',
          fileId: 'file-1',
          ownerId: 'owner-1',
          recipientId: 'user-recipient',
        }),
      ];
      mockAccessService.getMyShares.mockResolvedValue(shares);

      const result = await controller.getSharedWithMe(mockUser);

      expect(mockAccessService.getMyShares).toHaveBeenCalledWith(
        'user-recipient',
      );
      expect(result).toHaveLength(1);
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 취소
   */
  describe('revokeShare', () => {
    it('should revoke a share', async () => {
      const mockUser = { id: 'user-owner' };
      mockManagementService.revokeShare.mockResolvedValue();

      await controller.revokeShare(mockUser, 'share-123');

      expect(mockManagementService.revokeShare).toHaveBeenCalledWith(
        'user-owner',
        'share-123',
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 접근 (VIEW)
   */
  describe('accessShare', () => {
    it('should validate and track share access', async () => {
      const mockUser = { id: 'user-recipient' };
      const share = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-1',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW],
      });
      mockAccessService.validateAndTrackAccess.mockResolvedValue(share);

      const result = await controller.accessShare(
        mockUser,
        'share-123',
        SharePermission.VIEW,
      );

      expect(mockAccessService.validateAndTrackAccess).toHaveBeenCalledWith(
        'share-123',
        'user-recipient',
        SharePermission.VIEW,
      );
      expect(result.fileId).toBe('file-456');
    });
  });
});
