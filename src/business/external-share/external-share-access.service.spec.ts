/**
 * ============================================================
 * 📦 ExternalShareAccessService 테스트 (Unit Test)
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ExternalShareAccessService 클래스
 *
 * 📋 시나리오 매핑:
 *   - SC-010: 공유 목록 조회 성공
 *   - SC-011: 공유 상세 조회 + 콘텐츠 토큰 발급
 *   - SC-012: 파일 뷰어 콘텐츠 조회 성공
 *   - SC-013: 파일 다운로드 성공
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
import { BusinessException } from '../../common/exceptions';
import { ExternalShareAccessService } from './external-share-access.service';
import {
  PUBLIC_SHARE_REPOSITORY,
  IPublicShareRepository,
} from '../../domain/external-share/repositories/public-share.repository.interface';
import {
  ExternalUserDomainService,
  PublicShareDomainService as DomainPublicShareDomainService,
  ShareAccessLogDomainService,
} from '../../domain/external-share';
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
import { FileDownloadService } from '../file/file-download.service';
import { PublicShareDomainService } from './public-share-domain.service';

// TokenStore mock
const mockTokenStore: jest.Mocked<IContentTokenStore> = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

// FileDownloadService mock
const mockFileDownloadService = {
  download: jest.fn(),
  downloadWithRange: jest.fn(),
  releaseLease: jest.fn(),
};

// PublicShareDomainService mock
const mockShareDomainService = {
  findByIdWithFile: jest.fn(),
  findByExternalUserWithFiles: jest.fn(),
  findByOwnerWithFiles: jest.fn(),
  validateFileForShare: jest.fn(),
};

describe('ExternalShareAccessService (Unit Tests)', () => {
  let service: ExternalShareAccessService;
  let mockShareRepo: jest.Mocked<IPublicShareRepository>;
  let mockExternalUserService: { 조회: jest.Mock };
  let mockLogRepo: jest.Mocked<IShareAccessLogRepository>;

  /**
   * 🎭 Mock 설정
   * 📍 mockShareRepo: PublicShare 영속성 관리
   * 📍 mockExternalUserService: ExternalUser 조회 (Employee 기반)
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

    mockExternalUserService = {
      조회: jest.fn(),
    };

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

    // Reset fileDownloadService mocks
    mockFileDownloadService.download.mockReset();
    mockFileDownloadService.releaseLease.mockReset();

    // Reset shareDomainService mocks
    mockShareDomainService.findByIdWithFile.mockReset();
    mockShareDomainService.findByExternalUserWithFiles.mockReset();
    mockShareDomainService.findByOwnerWithFiles.mockReset();
    mockShareDomainService.validateFileForShare.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalShareAccessService,
        DomainPublicShareDomainService,
        { provide: PUBLIC_SHARE_REPOSITORY, useValue: mockShareRepo },
        { provide: ExternalUserDomainService, useValue: mockExternalUserService },
        ShareAccessLogDomainService,
        { provide: SHARE_ACCESS_LOG_REPOSITORY, useValue: mockLogRepo },
        { provide: CONTENT_TOKEN_STORE, useValue: mockTokenStore },
        { provide: FileDownloadService, useValue: mockFileDownloadService },
        { provide: PublicShareDomainService, useValue: mockShareDomainService },
      ],
    }).compile();

    service = module.get<ExternalShareAccessService>(ExternalShareAccessService);
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 SC-010: 공유 목록 조회 성공
   * ════════════════════════════════════════════════════════════════
   */
  describe('SC-010: 공유 목록 조회 성공', () => {
    /**
     * 🎯 검증 목적: 외부 사용자에게 공유된 파일 목록 반환
     *
     * 전제조건:
     * - 유효한 Access Token 보유
     * - 사용자에게 공유된 파일이 존재함
     */
    it('should return shares for external user with pagination', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      // 도메인 서비스가 파일 메타데이터가 채워진 공유 목록 반환
      const shares = [
        new PublicShare({
          id: '550e8400-e29b-41d4-a716-446655440001',
          fileId: 'file-uuid-001',
          ownerId: 'owner-1',
          externalUserId: 'ext-user-123',
          permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
          expiresAt: new Date('2026-02-28T23:59:59.000Z'),
          createdAt: new Date('2026-01-29T10:00:00.000Z'),
          fileName: '설계문서.pdf',
          mimeType: 'application/pdf',
        }),
        new PublicShare({
          id: '550e8400-e29b-41d4-a716-446655440002',
          fileId: 'file-uuid-002',
          ownerId: 'owner-2',
          externalUserId: 'ext-user-123',
          permissions: [SharePermission.VIEW],
          createdAt: new Date('2026-01-28T15:30:00.000Z'),
          fileName: '보고서.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ];

      mockShareDomainService.findByExternalUserWithFiles.mockResolvedValue({
        items: shares,
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getMyShares('ext-user-123', {
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 검증 1: HTTP 상태 코드 200 반환 (items 존재)
      expect(result.items).toHaveLength(2);

      // 검증 2: 활성 상태인 공유만 반환됨
      expect(result.items.every((s) => !s.isRevoked && !s.isBlocked)).toBe(true);

      // 검증 3: 페이지네이션 정보가 정확함
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalItems).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);

      // 검증 4: 파일 메타데이터가 채워져 있음
      expect(result.items[0].fileName).toBe('설계문서.pdf');
      expect(result.items[0].mimeType).toBe('application/pdf');

      // 검증 5: 도메인 서비스가 올바른 파라미터로 호출됨
      expect(mockShareDomainService.findByExternalUserWithFiles).toHaveBeenCalledWith('ext-user-123', {
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    });

    /**
     * 🎯 검증 목적: 빈 공유 목록도 정상 반환
     */
    it('should return empty items when no shares exist', async () => {
      mockShareDomainService.findByExternalUserWithFiles.mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });

      const result = await service.getMyShares('ext-user-no-shares', { page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(0);
      expect(result.totalItems).toBe(0);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 SC-011: 공유 상세 조회 + 콘텐츠 토큰 발급
   * ════════════════════════════════════════════════════════════════
   */
  describe('SC-011: 공유 상세 조회 + 콘텐츠 토큰 발급', () => {
    /**
     * 🎯 검증 목적: 공유 상세 정보와 일회성 토큰 반환
     *
     * 전제조건:
     * - 유효한 Access Token 보유
     * - 해당 공유가 본인에게 공유됨
     */
    it('should return share detail with content token', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      // 도메인 서비스가 파일 메타데이터가 채워진 공유 반환
      const share = new PublicShare({
        id: '550e8400-e29b-41d4-a716-446655440001',
        fileId: 'file-uuid-001',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
        maxViewCount: 10,
        currentViewCount: 3,
        maxDownloadCount: 5,
        currentDownloadCount: 1,
        expiresAt: new Date('2026-02-28T23:59:59.000Z'),
        isBlocked: false,
        isRevoked: false,
        fileName: '설계문서.pdf',
        mimeType: 'application/pdf',
      });
      mockShareDomainService.findByIdWithFile.mockResolvedValue(share);
      mockTokenStore.set.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getShareDetail('ext-user-123', '550e8400-e29b-41d4-a716-446655440001');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 검증 1: HTTP 상태 코드 200 반환
      expect(result.share.id).toBe('550e8400-e29b-41d4-a716-446655440001');

      // 검증 2: contentToken이 UUID 형식
      expect(result.contentToken).toBe('mock-token-uuid');

      // 검증 3: 공유 상세 정보가 정확함
      expect(result.share.maxViewCount).toBe(10);
      expect(result.share.currentViewCount).toBe(3);
      expect(result.share.maxDownloadCount).toBe(5);
      expect(result.share.currentDownloadCount).toBe(1);

      // 검증 4: Redis에 content-token:{tokenId} 키가 생성됨
      expect(mockTokenStore.set).toHaveBeenCalledWith(
        'content-token:mock-token-uuid',
        expect.stringContaining('"shareId":"550e8400-e29b-41d4-a716-446655440001"'),
        60, // TTL 60초
      );
    });

    /**
     * 🎯 에러 시나리오: 본인 공유가 아니면 BusinessException (접근 거부)
     */
    it('should throw BusinessException when not share recipient', async () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-789',
        externalUserId: 'other-ext-user', // 다른 외부 사용자
        isBlocked: false,
        isRevoked: false,
      });
      mockShareDomainService.findByIdWithFile.mockResolvedValue(share);

      await expect(service.getShareDetail('ext-user-123', 'share-123')).rejects.toThrow(
        BusinessException,
      );
    });

    /**
     * 🎯 에러 시나리오: 존재하지 않으면 BusinessException (공유 없음)
     */
    it('should throw BusinessException when share does not exist', async () => {
      mockShareDomainService.findByIdWithFile.mockResolvedValue(null);

      await expect(service.getShareDetail('ext-user-123', 'non-existent')).rejects.toThrow(
        BusinessException,
      );
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 토큰 검증 및 소비 (validateAndConsumeToken)
   * ════════════════════════════════════════════════════════════════
   */
  describe('토큰 검증 및 소비', () => {
    /**
     * 🎯 검증 목적: 유효한 토큰 검증 및 삭제 (일회용)
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
      expect(mockTokenStore.del).toHaveBeenCalled(); // 토큰 삭제 (일회용)
    });

    /**
     * 🎯 에러 시나리오: 존재하지 않는 토큰이면 BusinessException (토큰 무효)
     */
    it('should throw BusinessException when token not found', async () => {
      mockTokenStore.get.mockResolvedValue(null);

      await expect(service.validateAndConsumeToken('invalid-token')).rejects.toThrow(
        BusinessException,
      );
      await expect(service.validateAndConsumeToken('invalid-token')).rejects.toThrow(
        /콘텐츠 토큰이 유효하지 않거나 만료되었습니다/,
      );
    });

    /**
     * 🎯 에러 시나리오: 이미 사용된 토큰이면 BusinessException (토큰 이미 사용됨)
     */
    it('should throw BusinessException when token already used', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({
          shareId: 'share-123',
          permission: 'VIEW',
          used: true,
        }),
      );

      await expect(service.validateAndConsumeToken('used-token')).rejects.toThrow(
        BusinessException,
      );
      await expect(service.validateAndConsumeToken('used-token')).rejects.toThrow(
        /이미 사용된 토큰입니다/,
      );
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 SC-012: 파일 뷰어 콘텐츠 조회 성공
   * ════════════════════════════════════════════════════════════════
   */
  describe('SC-012: 파일 뷰어 콘텐츠 조회 성공', () => {
    const viewAccessParams = {
      externalUserId: 'ext-user-123',
      shareId: '550e8400-e29b-41d4-a716-446655440001',
      token: 'ct_abc123def456',
      action: AccessAction.VIEW,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      deviceType: 'desktop',
    };

    /**
     * 🎯 검증 목적: 6단계 검증 통과 시 파일 콘텐츠 반환
     *
     * 전제조건:
     * - 유효한 Access Token 보유
     * - 유효한 Content Token 보유
     * - 공유에 VIEW 권한 있음
     * - 조회 횟수 제한 초과하지 않음
     */
    it('should allow VIEW access when all validations pass', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      // 1. 토큰 유효
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({
          shareId: '550e8400-e29b-41d4-a716-446655440001',
          permission: 'VIEW',
          used: false,
        }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      // 2. 공유 유효 (차단/취소 아님, 만료 아님, 횟수 미초과)
      // Repository는 파일 메타데이터 없이 반환 (서비스에서 채움)
      const share = new PublicShare({
        id: '550e8400-e29b-41d4-a716-446655440001',
        fileId: 'file-uuid-001',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW],
        maxViewCount: 10,
        currentViewCount: 3, // 3회 사용, 7회 남음
        isBlocked: false,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000), // 내일
        // fileName, mimeType은 서비스에서 FileDownloadService 결과로 채움
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockShareRepo.save.mockImplementation(async (s) => s);

      // 3. 사용자 활성
      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockExternalUserService.조회.mockResolvedValue(user);

      // 4. 파일 다운로드 결과
      const mockFile = {
        id: 'file-uuid-001',
        name: '설계문서_v1.0.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024000,
      };
      mockFileDownloadService.downloadWithRange.mockResolvedValue({
        file: mockFile,
        storageObject: {},
        stream: null,
      });

      // 로그 저장
      mockLogRepo.save.mockImplementation(async (log) => log);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.accessContent(viewAccessParams);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 검증 1: HTTP 상태 코드 200 반환
      expect(result.success).toBe(true);

      // 검증 2: Content-Type이 파일의 mimeType과 일치
      expect(result.file.mimeType).toBe('application/pdf');

      // 검증 3: 파일 정보 반환
      expect(result.file.name).toBe('설계문서_v1.0.pdf');
      expect(result.file.sizeBytes).toBe(1024000);

      // 검증 4: currentViewCount가 1 증가함 (3 → 4)
      expect(result.share.currentViewCount).toBe(4);

      // 검증 5: share에 파일 메타데이터가 채워져 있음
      expect(result.share.fileName).toBe('설계문서_v1.0.pdf');
      expect(result.share.mimeType).toBe('application/pdf');

      // 검증 6: FileDownloadService가 호출됨
      expect(mockFileDownloadService.downloadWithRange).toHaveBeenCalledWith(
        'file-uuid-001',
        expect.any(Object),
      );

      // 검증 7: 접근 로그가 기록됨 (success: true, action: VIEW)
      expect(mockLogRepo.save).toHaveBeenCalled();
      const savedLog = mockLogRepo.save.mock.calls[0][0];
      expect(savedLog.success).toBe(true);
      expect(savedLog.action).toBe(AccessAction.VIEW);

      // 검증 8: Content Token이 소비됨 (삭제)
      expect(mockTokenStore.del).toHaveBeenCalled();
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 SC-013: 파일 다운로드 성공
   * ════════════════════════════════════════════════════════════════
   */
  describe('SC-013: 파일 다운로드 성공', () => {
    const downloadAccessParams = {
      externalUserId: 'ext-user-123',
      shareId: '550e8400-e29b-41d4-a716-446655440001',
      token: 'ct_new123def456',
      action: AccessAction.DOWNLOAD,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      deviceType: 'desktop',
    };

    /**
     * 🎯 검증 목적: 6단계 검증 통과 시 파일 다운로드
     *
     * 전제조건:
     * - 유효한 Access Token 보유
     * - 유효한 Content Token 보유 (새로 발급 필요)
     * - 공유에 DOWNLOAD 권한 있음
     * - 다운로드 횟수 제한 초과하지 않음
     */
    it('should allow DOWNLOAD access when all validations pass', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      // 1. 토큰 유효
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({
          shareId: '550e8400-e29b-41d4-a716-446655440001',
          permission: 'DOWNLOAD',
          used: false,
        }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      // 2. 공유 유효 (DOWNLOAD 권한 있음)
      // Repository는 파일 메타데이터 없이 반환 (서비스에서 채움)
      const share = new PublicShare({
        id: '550e8400-e29b-41d4-a716-446655440001',
        fileId: 'file-uuid-001',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
        maxDownloadCount: 5,
        currentDownloadCount: 1, // 1회 사용, 4회 남음
        isBlocked: false,
        isRevoked: false,
        // fileName, mimeType은 서비스에서 FileDownloadService 결과로 채움
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockShareRepo.save.mockImplementation(async (s) => s);

      // 3. 사용자 활성
      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockExternalUserService.조회.mockResolvedValue(user);

      // 4. 파일 다운로드 결과
      const mockFile = {
        id: 'file-uuid-001',
        name: '설계문서_v1.0.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024000,
      };
      mockFileDownloadService.downloadWithRange.mockResolvedValue({
        file: mockFile,
        storageObject: {},
        stream: { pipe: jest.fn() }, // Mock stream
      });

      mockLogRepo.save.mockImplementation(async (log) => log);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.accessContent(downloadAccessParams);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 검증 1: HTTP 상태 코드 200 반환
      expect(result.success).toBe(true);

      // 검증 2: 파일 스트림이 반환됨
      expect(result.stream).toBeDefined();

      // 검증 3: currentDownloadCount가 1 증가함 (1 → 2)
      expect(result.share.currentDownloadCount).toBe(2);

      // 검증 4: share에 파일 메타데이터가 채워져 있음
      expect(result.share.fileName).toBe('설계문서_v1.0.pdf');
      expect(result.share.mimeType).toBe('application/pdf');

      // 검증 5: 접근 로그가 기록됨 (success: true, action: DOWNLOAD)
      expect(mockLogRepo.save).toHaveBeenCalled();
      const savedLog = mockLogRepo.save.mock.calls[0][0];
      expect(savedLog.success).toBe(true);
      expect(savedLog.action).toBe(AccessAction.DOWNLOAD);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 6단계 검증 플로우 - 에러 시나리오
   * ════════════════════════════════════════════════════════════════
   */
  describe('6단계 검증 플로우 - 에러 시나리오', () => {
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
     * 🎯 단계 1 실패: 토큰-공유 ID 불일치
     */
    it('Step 1: should deny when token-share ID mismatch', async () => {
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({ shareId: 'different-share', permission: 'VIEW', used: false }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(BusinessException);
    });

    /**
     * 🎯 단계 2 실패: 차단된 공유
     */
    it('Step 2: should deny when share is blocked', async () => {
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

      await expect(service.accessContent(accessParams)).rejects.toThrow(BusinessException);
    });

    /**
     * 🎯 단계 2 실패: 취소된 공유
     */
    it('Step 2: should deny when share is revoked', async () => {
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

      await expect(service.accessContent(accessParams)).rejects.toThrow(BusinessException);
    });

    /**
     * 🎯 단계 3 실패: 비활성화된 사용자
     */
    it('Step 3: should deny when user is deactivated', async () => {
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
      mockExternalUserService.조회.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(BusinessException);
    });

    /**
     * 🎯 단계 4 실패: 만료된 공유
     */
    it('Step 4: should deny when share is expired', async () => {
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
        expiresAt: new Date('2020-01-01'), // 과거 (만료됨)
      });
      mockShareRepo.findById.mockResolvedValue(share);

      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockExternalUserService.조회.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(BusinessException);
    });

    /**
     * 🎯 단계 5 실패: 뷰 횟수 초과
     */
    it('Step 5: should deny when view limit exceeded', async () => {
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
      mockExternalUserService.조회.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      await expect(service.accessContent(accessParams)).rejects.toThrow(BusinessException);
    });

    /**
     * 🎯 단계 6 실패: 권한 없음 (DOWNLOAD 권한 없이 다운로드 시도)
     */
    it('Step 6: should deny when permission not granted', async () => {
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
      mockExternalUserService.조회.mockResolvedValue(user);
      mockLogRepo.save.mockImplementation(async (log) => log);

      const downloadParams = { ...accessParams, action: AccessAction.DOWNLOAD };
      await expect(service.accessContent(downloadParams)).rejects.toThrow(BusinessException);
    });

    /**
     * 📌 테스트 시나리오: 파일 다운로드 실패 시 카운트 롤백
     *
     * 🎯 검증 목적:
     *   모든 검증 통과 후 파일 다운로드가 실패하면,
     *   이미 증가된 조회/다운로드 카운트가 롤백되어야 함
     *   (사용자에게 실제 접근 실패인데 횟수만 차감되는 불이익 방지)
     *
     * ✅ 기대 결과:
     *   - 에러가 발생해야 함
     *   - share.currentViewCount가 원래 값으로 유지됨
     *   - 실패 로그가 기록됨
     */
    it('should rollback view count when file download fails', async () => {
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

      // 2. 공유 유효 (초기 viewCount = 5)
      const initialViewCount = 5;
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW],
        maxViewCount: 10,
        currentViewCount: initialViewCount,
        isBlocked: false,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockShareRepo.save.mockImplementation(async (s) => s);

      // 3. 사용자 활성
      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockExternalUserService.조회.mockResolvedValue(user);

      // 4. 파일 다운로드 실패!
      mockFileDownloadService.downloadWithRange.mockRejectedValue(
        new Error('파일 스토리지 접근 실패'),
      );

      mockLogRepo.save.mockImplementation(async (log) => log);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await expect(service.accessContent(accessParams)).rejects.toThrow(
        '파일 스토리지 접근 실패',
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 1. 카운트가 증가하지 않고 원래 값 유지됨
      //    (다운로드 성공 후에만 카운트가 증가하므로)
      expect(share.currentViewCount).toBe(initialViewCount);

      // 2. share.save가 호출되지 않음 (다운로드 실패로 카운트 증가 전에 종료)
      expect(mockShareRepo.save).not.toHaveBeenCalled();

      // 3. 실패 로그가 기록됨
      expect(mockLogRepo.save).toHaveBeenCalled();
    });

    /**
     * 📌 테스트 시나리오: 파일 다운로드 실패 시 다운로드 카운트 롤백
     *
     * 🎯 검증 목적:
     *   DOWNLOAD 액션에서 파일 다운로드가 실패하면,
     *   이미 증가된 다운로드 카운트가 롤백되어야 함
     */
    it('should rollback download count when file download fails', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockTokenStore.get.mockResolvedValue(
        JSON.stringify({
          shareId: 'share-123',
          permission: 'DOWNLOAD',
          used: false,
        }),
      );
      mockTokenStore.del.mockResolvedValue(undefined);

      const initialDownloadCount = 3;
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.DOWNLOAD],
        maxDownloadCount: 10,
        currentDownloadCount: initialDownloadCount,
        isBlocked: false,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockShareRepo.findById.mockResolvedValue(share);
      mockShareRepo.save.mockImplementation(async (s) => s);

      const user = new ExternalUser({
        id: 'ext-user-123',
        isActive: true,
        createdBy: 'admin',
      });
      mockExternalUserService.조회.mockResolvedValue(user);

      // 파일 다운로드 실패
      mockFileDownloadService.downloadWithRange.mockRejectedValue(
        new Error('NAS 연결 실패'),
      );

      mockLogRepo.save.mockImplementation(async (log) => log);

      const downloadParams = { ...accessParams, action: AccessAction.DOWNLOAD };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await expect(service.accessContent(downloadParams)).rejects.toThrow(
        'NAS 연결 실패',
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // 다운로드 카운트가 롤백됨
      expect(share.currentDownloadCount).toBe(initialDownloadCount);
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════
   * 📌 Lease 해제
   * ════════════════════════════════════════════════════════════════
   */
  describe('releaseLease', () => {
    it('should release lease via FileDownloadService', async () => {
      await service.releaseLease('file-456');

      expect(mockFileDownloadService.releaseLease).toHaveBeenCalledWith('file-456');
    });
  });
});
