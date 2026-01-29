/**
 * ============================================================
 * 📦 외부 공유 전체 플로우 Integration Test
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - SC-020: 전체 플로우 (로그인 → 목록 → 상세 → 다운로드)
 *
 * 📋 테스트 흐름:
 *   1. POST /v1/ext-auth/login → accessToken, refreshToken 획득
 *   2. GET /v1/ext/shares → 공유 목록 조회
 *   3. GET /v1/ext/shares/:shareId → contentToken 획득
 *   4. GET /v1/ext/shares/:shareId/download?token={contentToken} → 파일 다운로드
 *   5. POST /v1/ext-auth/logout → 토큰 무효화
 *
 * ⚠️ 이 테스트는 Service 레이어를 Mock하여 Controller 통합 테스트를 수행합니다.
 * ============================================================
 */
// uuid ESM 모듈 문제 우회
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import * as bcrypt from 'bcrypt';

// Controllers
import { ExternalAuthController } from './external-auth.controller';
import { ExternalShareController } from './external-share.controller';

// Services
import { ExternalAuthService, LoginResult } from '../../../business/external-share/external-auth.service';
import { ExternalShareAccessService, ShareDetailResult, AccessResult } from '../../../business/external-share/external-share-access.service';

// Entities
import { PublicShare } from '../../../domain/external-share/entities/public-share.entity';
import { SharePermission } from '../../../domain/external-share/type/public-share.type';
import { FileEntity } from '../../../domain/file';
import { AccessAction } from '../../../domain/external-share/entities/share-access-log.entity';

// Guards
import { ExternalJwtAuthGuard } from '../../../common/guards';

describe('SC-020: 외부 공유 전체 플로우 Integration Test', () => {
  let authController: ExternalAuthController;
  let shareController: ExternalShareController;
  let mockAuthService: jest.Mocked<ExternalAuthService>;
  let mockAccessService: jest.Mocked<ExternalShareAccessService>;

  // Test Data
  const testUser = {
    id: 'ext-user-001',
    username: 'external_user_001',
    name: '홍길동',
    email: 'hong@partner.com',
    company: '파트너사 A',
  };

  const testShare = new PublicShare({
    id: '550e8400-e29b-41d4-a716-446655440001',
    fileId: 'file-uuid-001',
    ownerId: 'internal-user-001',
    externalUserId: 'ext-user-001',
    permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
    maxViewCount: 10,
    currentViewCount: 0,
    maxDownloadCount: 5,
    currentDownloadCount: 0,
    isBlocked: false,
    isRevoked: false,
    createdAt: new Date(),
  });

  const testFile: FileEntity = {
    id: 'file-uuid-001',
    name: '설계문서_v1.0.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024000,
  } as FileEntity;

  beforeEach(async () => {
    // Mock Services 설정
    mockAuthService = {
      login: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
      changePassword: jest.fn(),
      isTokenBlacklisted: jest.fn(),
    } as unknown as jest.Mocked<ExternalAuthService>;

    mockAccessService = {
      getMyShares: jest.fn(),
      getShareDetail: jest.fn(),
      accessContent: jest.fn(),
      releaseLease: jest.fn(),
    } as unknown as jest.Mocked<ExternalShareAccessService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalAuthController, ExternalShareController],
      providers: [
        { provide: ExternalAuthService, useValue: mockAuthService },
        { provide: ExternalShareAccessService, useValue: mockAccessService },
      ],
    })
      .overrideGuard(ExternalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    authController = module.get<ExternalAuthController>(ExternalAuthController);
    shareController = module.get<ExternalShareController>(ExternalShareController);
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 SC-020: 전체 플로우 테스트
   * ════════════════════════════════════════════════════════════════
   */
  describe('전체 플로우: 로그인 → 목록 → 상세 → 다운로드 → 로그아웃', () => {
    it('should complete full external share flow successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // Step 1: 로그인
      // ═══════════════════════════════════════════════════════
      const loginResult: LoginResult = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: testUser,
      };
      mockAuthService.login.mockResolvedValue(loginResult);

      const loginResponse = await authController.login({
        username: 'external_user_001',
        password: 'SecureP@ss123!',
      });

      // 검증: accessToken, refreshToken 반환
      expect(loginResponse.accessToken).toBe('mock-access-token');
      expect(loginResponse.refreshToken).toBe('mock-refresh-token');
      expect(loginResponse.user.username).toBe('external_user_001');

      // ═══════════════════════════════════════════════════════
      // Step 2: 공유 목록 조회
      // ═══════════════════════════════════════════════════════
      mockAccessService.getMyShares.mockResolvedValue({
        items: [testShare],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });

      const listResponse = await shareController.getMyShares(
        { id: testUser.id },
        1,
        20,
      );

      // 검증: 공유 목록 반환
      expect(listResponse.items).toHaveLength(1);
      expect(listResponse.items[0].id).toBe(testShare.id);

      // ═══════════════════════════════════════════════════════
      // Step 3: 공유 상세 조회 + 콘텐츠 토큰 발급
      // ═══════════════════════════════════════════════════════
      const shareDetailResult: ShareDetailResult = {
        share: testShare,
        contentToken: 'ct_abc123def456',
      };
      mockAccessService.getShareDetail.mockResolvedValue(shareDetailResult);

      const detailResponse = await shareController.getShareDetail(
        { id: testUser.id },
        testShare.id,
      );

      // 검증: contentToken 반환
      expect(detailResponse.share.id).toBe(testShare.id);
      expect(detailResponse.contentToken).toBe('ct_abc123def456');

      // ═══════════════════════════════════════════════════════
      // Step 4: 파일 다운로드
      // ═══════════════════════════════════════════════════════
      const mockStream = new Readable({
        read() {
          this.push('file content');
          this.push(null);
        },
      });

      const accessResult: AccessResult = {
        success: true,
        share: testShare,
        file: testFile,
        stream: mockStream,
      };
      mockAccessService.accessContent.mockResolvedValue(accessResult);

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as any;

      // pipe를 mock
      mockStream.pipe = jest.fn().mockImplementation((res) => {
        process.nextTick(() => mockStream.emit('end'));
        return res;
      });

      await shareController.downloadFile(
        { id: testUser.id },
        testShare.id,
        'ct_abc123def456',
        'Mozilla/5.0',
        '192.168.1.100',
        mockRes,
      );

      // 검증: 다운로드 호출됨
      expect(mockAccessService.accessContent).toHaveBeenCalledWith(
        expect.objectContaining({
          externalUserId: testUser.id,
          shareId: testShare.id,
          token: 'ct_abc123def456',
          action: AccessAction.DOWNLOAD,
        }),
      );

      // 검증: Content-Disposition이 attachment로 설정됨
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Disposition': expect.stringContaining('attachment'),
        }),
      );

      // ═══════════════════════════════════════════════════════
      // Step 5: 로그아웃
      // ═══════════════════════════════════════════════════════
      mockAuthService.logout.mockResolvedValue(undefined);

      const mockReq = { accessToken: 'mock-access-token' } as any;
      const logoutResponse = await authController.logout(
        { id: testUser.id },
        mockReq,
      );

      // 검증: 로그아웃 성공
      expect(logoutResponse.message).toBe('Logged out successfully');
      expect(mockAuthService.logout).toHaveBeenCalledWith(
        'mock-access-token',
        testUser.id,
      );
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 개별 Controller 통합 테스트
   * ════════════════════════════════════════════════════════════════
   */
  describe('개별 Controller 통합 테스트', () => {
    describe('ExternalAuthController', () => {
      it('SC-001: should call login service with correct parameters', async () => {
        const loginResult: LoginResult = {
          accessToken: 'token',
          refreshToken: 'refresh',
          user: testUser,
        };
        mockAuthService.login.mockResolvedValue(loginResult);

        await authController.login({
          username: 'external_user_001',
          password: 'password',
        });

        expect(mockAuthService.login).toHaveBeenCalledWith({
          username: 'external_user_001',
          password: 'password',
        });
      });

      it('SC-002: should call refreshToken service with correct parameters', async () => {
        mockAuthService.refreshToken.mockResolvedValue({
          accessToken: 'new-token',
          expiresIn: 900,
        });

        await authController.refreshToken({
          refreshToken: 'valid-refresh-token',
        });

        expect(mockAuthService.refreshToken).toHaveBeenCalledWith({
          refreshToken: 'valid-refresh-token',
        });
      });

      it('SC-004: should call changePassword service with correct parameters', async () => {
        mockAuthService.changePassword.mockResolvedValue(undefined);

        const mockReq = { accessToken: 'current-token' } as any;
        await authController.changePassword(
          { id: testUser.id },
          {
            currentPassword: 'oldpass',
            newPassword: 'newpass',
          },
          mockReq,
        );

        expect(mockAuthService.changePassword).toHaveBeenCalledWith(
          testUser.id,
          { currentPassword: 'oldpass', newPassword: 'newpass' },
          'current-token',
        );
      });
    });

    describe('ExternalShareController', () => {
      it('SC-010: should call getMyShares service with pagination', async () => {
        mockAccessService.getMyShares.mockResolvedValue({
          items: [],
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        });

        await shareController.getMyShares(
          { id: testUser.id },
          2,
          10,
          'createdAt',
          'desc',
        );

        expect(mockAccessService.getMyShares).toHaveBeenCalledWith(testUser.id, {
          page: 2,
          pageSize: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
      });

      it('SC-011: should call getShareDetail service', async () => {
        mockAccessService.getShareDetail.mockResolvedValue({
          share: testShare,
          contentToken: 'token',
        });

        await shareController.getShareDetail({ id: testUser.id }, testShare.id);

        expect(mockAccessService.getShareDetail).toHaveBeenCalledWith(
          testUser.id,
          testShare.id,
        );
      });

      it('SC-012: should call accessContent with VIEW action for content endpoint', async () => {
        mockAccessService.accessContent.mockResolvedValue({
          success: true,
          share: testShare,
          file: testFile,
          stream: null,
        });

        const mockRes = {
          set: jest.fn(),
          end: jest.fn(),
        } as any;

        await shareController.getContent(
          { id: testUser.id },
          testShare.id,
          'content-token',
          'Mozilla/5.0',
          '192.168.1.100',
          mockRes,
        );

        expect(mockAccessService.accessContent).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AccessAction.VIEW,
          }),
        );

        // Content-Disposition이 inline (뷰어용)
        expect(mockRes.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'Content-Disposition': expect.stringContaining('inline'),
          }),
        );
      });

      it('SC-013: should call accessContent with DOWNLOAD action for download endpoint', async () => {
        const mockStream = new Readable({ read() { this.push(null); } });
        mockAccessService.accessContent.mockResolvedValue({
          success: true,
          share: testShare,
          file: testFile,
          stream: mockStream,
        });

        const mockRes = {
          set: jest.fn(),
          end: jest.fn(),
        } as any;
        mockStream.pipe = jest.fn().mockReturnValue(mockRes);

        await shareController.downloadFile(
          { id: testUser.id },
          testShare.id,
          'content-token',
          'Mozilla/5.0',
          '192.168.1.100',
          mockRes,
        );

        expect(mockAccessService.accessContent).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AccessAction.DOWNLOAD,
          }),
        );

        // Content-Disposition이 attachment (다운로드용)
        expect(mockRes.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'Content-Disposition': expect.stringContaining('attachment'),
          }),
        );
      });
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 디바이스 타입 감지 테스트
   * ════════════════════════════════════════════════════════════════
   */
  describe('디바이스 타입 감지', () => {
    it('should detect mobile device from user-agent', async () => {
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share: testShare,
        file: testFile,
        stream: null,
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await shareController.getContent(
        { id: testUser.id },
        testShare.id,
        'token',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        '192.168.1.100',
        mockRes,
      );

      expect(mockAccessService.accessContent).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceType: 'mobile',
        }),
      );
    });

    it('should detect tablet device from user-agent', async () => {
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share: testShare,
        file: testFile,
        stream: null,
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await shareController.getContent(
        { id: testUser.id },
        testShare.id,
        'token',
        'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
        '192.168.1.100',
        mockRes,
      );

      expect(mockAccessService.accessContent).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceType: 'tablet',
        }),
      );
    });

    it('should detect desktop device from user-agent', async () => {
      mockAccessService.accessContent.mockResolvedValue({
        success: true,
        share: testShare,
        file: testFile,
        stream: null,
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await shareController.getContent(
        { id: testUser.id },
        testShare.id,
        'token',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
        '192.168.1.100',
        mockRes,
      );

      expect(mockAccessService.accessContent).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceType: 'desktop',
        }),
      );
    });
  });
});
