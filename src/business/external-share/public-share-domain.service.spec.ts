/**
 * ============================================================
 * 📦 PublicShareDomainService 테스트 (Unit Test)
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - PublicShareDomainService 클래스
 *
 * 📋 테스트 범위:
 *   - findByIdWithFile: 단일 조회 + 파일 메타데이터 채움
 *   - findByExternalUserWithFiles: 목록 조회 + 배치 파일 조회
 *   - validateFileForShare: 파일 공유 가능 상태 검증
 *
 * ⚠️ DDD 원칙:
 *   - 도메인 서비스는 여러 Aggregate를 조합
 *   - Repository는 단일 Aggregate만 담당
 * ============================================================
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PublicShareDomainService } from './public-share-domain.service';
import {
  PublicShareDomainService as DomainPublicShareDomainService,
} from '../../domain/external-share';
import { FileDomainService } from '../../domain/file';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import { FileEntity } from '../../domain/file/entities/file.entity';
import { FileState } from '../../domain/file/type/file.type';
import { SharePermission } from '../../domain/external-share/type/public-share.type';

describe('PublicShareDomainService (Unit Tests)', () => {
  let service: PublicShareDomainService;
  let mockShareDomainService: {
    조회: jest.Mock;
    외부사용자별조회: jest.Mock;
    소유자별조회: jest.Mock;
    전체조회: jest.Mock;
  };
  let mockFileDomainService: {
    조회: jest.Mock;
    아이디목록조회: jest.Mock;
  };

  beforeEach(async () => {
    mockShareDomainService = {
      조회: jest.fn(),
      외부사용자별조회: jest.fn(),
      소유자별조회: jest.fn(),
      전체조회: jest.fn(),
    };

    mockFileDomainService = {
      조회: jest.fn(),
      아이디목록조회: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicShareDomainService,
        { provide: DomainPublicShareDomainService, useValue: mockShareDomainService },
        { provide: FileDomainService, useValue: mockFileDomainService },
      ],
    }).compile();

    service = module.get<PublicShareDomainService>(PublicShareDomainService);
  });

  // ═════════════════════════════════════════════════════════════
  // 📌 findByIdWithFile: 단일 조회 + 파일 메타데이터 채움
  // ═════════════════════════════════════════════════════════════
  describe('findByIdWithFile', () => {
    it('공유가 존재하면 파일 메타데이터가 채워진 공유를 반환한다', async () => {
      // Given
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW],
      });
      const file = new FileEntity({
        id: 'file-456',
        name: '설계문서.pdf',
        mimeType: 'application/pdf',
        folderId: 'folder-1',
        sizeBytes: 1024,
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockShareDomainService.조회.mockResolvedValue(share);
      mockFileDomainService.조회.mockResolvedValue(file);

      // When
      const result = await service.findByIdWithFile('share-123');

      // Then
      expect(result).not.toBeNull();
      expect(result!.id).toBe('share-123');
      expect(result!.fileName).toBe('설계문서.pdf');
      expect(result!.mimeType).toBe('application/pdf');
      expect(mockFileDomainService.조회).toHaveBeenCalledWith('file-456');
    });

    it('공유가 존재하지 않으면 null을 반환한다', async () => {
      // Given
      mockShareDomainService.조회.mockResolvedValue(null);

      // When
      const result = await service.findByIdWithFile('non-existent');

      // Then
      expect(result).toBeNull();
      expect(mockFileDomainService.조회).not.toHaveBeenCalled();
    });

    it('파일이 존재하지 않으면 메타데이터 없이 공유를 반환한다', async () => {
      // Given
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'deleted-file',
        ownerId: 'owner-789',
        externalUserId: 'ext-user-123',
        permissions: [SharePermission.VIEW],
      });

      mockShareDomainService.조회.mockResolvedValue(share);
      mockFileDomainService.조회.mockResolvedValue(null);

      // When
      const result = await service.findByIdWithFile('share-123');

      // Then
      expect(result).not.toBeNull();
      expect(result!.fileName).toBeUndefined();
      expect(result!.mimeType).toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 📌 findByExternalUserWithFiles: 목록 조회 + 배치 파일 조회
  // ═════════════════════════════════════════════════════════════
  describe('findByExternalUserWithFiles', () => {
    it('공유 목록과 파일 메타데이터를 배치로 조회하여 반환한다', async () => {
      // Given
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

      const files = [
        new FileEntity({
          id: 'file-1',
          name: '문서1.pdf',
          mimeType: 'application/pdf',
          folderId: 'folder-1',
          sizeBytes: 1024,
          state: FileState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        new FileEntity({
          id: 'file-2',
          name: '이미지.png',
          mimeType: 'image/png',
          folderId: 'folder-1',
          sizeBytes: 2048,
          state: FileState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockShareDomainService.외부사용자별조회.mockResolvedValue({
        items: shares,
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
      mockFileDomainService.아이디목록조회.mockResolvedValue(files);

      // When
      const result = await service.findByExternalUserWithFiles('ext-user-123', {
        page: 1,
        pageSize: 20,
      });

      // Then
      expect(result.items).toHaveLength(2);
      expect(result.items[0].fileName).toBe('문서1.pdf');
      expect(result.items[0].mimeType).toBe('application/pdf');
      expect(result.items[1].fileName).toBe('이미지.png');
      expect(result.items[1].mimeType).toBe('image/png');

      // 배치 조회가 한 번만 호출됨 (N+1 방지)
      expect(mockFileDomainService.아이디목록조회).toHaveBeenCalledTimes(1);
      expect(mockFileDomainService.아이디목록조회).toHaveBeenCalledWith(['file-1', 'file-2']);
    });

    it('빈 목록이면 파일 조회를 하지 않는다', async () => {
      // Given
      mockShareDomainService.외부사용자별조회.mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });

      // When
      const result = await service.findByExternalUserWithFiles('ext-user-123', {
        page: 1,
        pageSize: 20,
      });

      // Then
      expect(result.items).toHaveLength(0);
      expect(mockFileDomainService.아이디목록조회).not.toHaveBeenCalled();
    });

    it('중복된 fileId는 한 번만 조회한다', async () => {
      // Given: 같은 파일을 여러 번 공유한 경우
      const shares = [
        new PublicShare({
          id: 'share-1',
          fileId: 'same-file',
          ownerId: 'owner-1',
          externalUserId: 'ext-user-123',
          permissions: [SharePermission.VIEW],
        }),
        new PublicShare({
          id: 'share-2',
          fileId: 'same-file', // 동일한 파일
          ownerId: 'owner-2',
          externalUserId: 'ext-user-123',
          permissions: [SharePermission.DOWNLOAD],
        }),
      ];

      const files = [
        new FileEntity({
          id: 'same-file',
          name: '공유문서.pdf',
          mimeType: 'application/pdf',
          folderId: 'folder-1',
          sizeBytes: 1024,
          state: FileState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockShareDomainService.외부사용자별조회.mockResolvedValue({
        items: shares,
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
      mockFileDomainService.아이디목록조회.mockResolvedValue(files);

      // When
      const result = await service.findByExternalUserWithFiles('ext-user-123', {
        page: 1,
        pageSize: 20,
      });

      // Then: 중복 제거되어 한 번만 조회
      expect(mockFileDomainService.아이디목록조회).toHaveBeenCalledWith(['same-file']);
      expect(result.items[0].fileName).toBe('공유문서.pdf');
      expect(result.items[1].fileName).toBe('공유문서.pdf');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 📌 validateFileForShare: 파일 공유 가능 상태 검증
  // ═════════════════════════════════════════════════════════════
  describe('validateFileForShare', () => {
    it('ACTIVE 상태 파일은 유효하다', async () => {
      // Given
      const file = new FileEntity({
        id: 'file-123',
        name: '문서.pdf',
        mimeType: 'application/pdf',
        folderId: 'folder-1',
        sizeBytes: 1024,
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockFileDomainService.조회.mockResolvedValue(file);

      // When
      const result = await service.validateFileForShare('file-123');

      // Then
      expect(result.valid).toBe(true);
      expect(result.file).not.toBeNull();
      expect(result.errorCode).toBeUndefined();
    });

    it('존재하지 않는 파일은 유효하지 않다', async () => {
      // Given
      mockFileDomainService.조회.mockResolvedValue(null);

      // When
      const result = await service.validateFileForShare('non-existent');

      // Then
      expect(result.valid).toBe(false);
      expect(result.file).toBeNull();
      expect(result.errorCode).toBe('FILE_NOT_FOUND');
      expect(result.errorMessage).toBe('파일을 찾을 수 없습니다.');
    });

    it('휴지통에 있는 파일은 유효하지 않다', async () => {
      // Given
      const file = new FileEntity({
        id: 'file-123',
        name: '삭제된문서.pdf',
        mimeType: 'application/pdf',
        folderId: 'folder-1',
        sizeBytes: 1024,
        state: FileState.TRASHED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockFileDomainService.조회.mockResolvedValue(file);

      // When
      const result = await service.validateFileForShare('file-123');

      // Then
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('FILE_IN_TRASH');
      expect(result.errorMessage).toBe('휴지통에 있는 파일입니다.');
    });

    it('영구 삭제된 파일은 유효하지 않다', async () => {
      // Given
      const file = new FileEntity({
        id: 'file-123',
        name: '영구삭제문서.pdf',
        mimeType: 'application/pdf',
        folderId: 'folder-1',
        sizeBytes: 1024,
        state: FileState.DELETED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockFileDomainService.조회.mockResolvedValue(file);

      // When
      const result = await service.validateFileForShare('file-123');

      // Then
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('FILE_DELETED');
      expect(result.errorMessage).toBe('삭제된 파일입니다.');
    });
  });
});
