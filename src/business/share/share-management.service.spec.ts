/**
 * ============================================================
 * 📦 ShareManagementService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ShareManagementService 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 파일 소유자(Owner)가 공유를 생성/관리
 *   - 파일 존재 여부 및 소유권 검증
 *   - 중복 공유 방지
 *
 * ⚠️ 중요 고려사항:
 *   - 파일이 존재하지 않으면 에러
 *   - 소유자만 공유 생성/취소 가능
 *   - 같은 파일을 같은 수신자에게 중복 공유 불가
 * ============================================================
 */
// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-share-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ShareManagementService } from './share-management.service';
import { FILE_SHARE_REPOSITORY } from '../../domain/share/repositories/file-share.repository.interface';
import {
  FILE_REPOSITORY,
  IFileRepository,
} from '../../domain/file/repositories/file.repository.interface';
import { FileShare } from '../../domain/share/entities/file-share.entity';
import { SharePermission } from '../../domain/share/share-permission.enum';
import { CreateShareDto } from './dto/create-share.dto';

import type { IFileShareRepository } from '../../domain/share/repositories/file-share.repository.interface';

describe('ShareManagementService', () => {
  let service: ShareManagementService;
  let mockShareRepo: jest.Mocked<IFileShareRepository>;
  let mockFileRepo: jest.Mocked<Partial<IFileRepository>>;

  /**
   * 🎭 Mock 설정
   * 📍 mockShareRepo: FileShare 영속성 관리
   * 📍 mockFileRepo: 파일 존재/소유권 검증용
   */
  beforeEach(async () => {
    mockShareRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByRecipient: jest.fn(),
      findByOwner: jest.fn(),
      findByFileId: jest.fn(),
      findByFileAndRecipient: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IFileShareRepository>;

    mockFileRepo = {
      findById: jest.fn(),
    } as jest.Mocked<Partial<IFileRepository>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShareManagementService,
        {
          provide: FILE_SHARE_REPOSITORY,
          useValue: mockShareRepo,
        },
        {
          provide: FILE_REPOSITORY,
          useValue: mockFileRepo,
        },
      ],
    }).compile();

    service = module.get<ShareManagementService>(ShareManagementService);
  });

  /**
   * 📌 테스트 시나리오: 공유 생성
   */
  describe('createShare', () => {
    const createShareDto: CreateShareDto = {
      fileId: 'file-123',
      recipientId: 'user-recipient',
      permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
      maxDownloadCount: 5,
      expiresAt: new Date('2026-02-01'),
    };

    /**
     * 🎯 검증 목적: 정상적인 공유 생성
     */
    it('should create a share successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFileRepo.findById.mockResolvedValue({
        id: 'file-123',
        ownerId: 'user-owner',
      });
      mockShareRepo.findByFileAndRecipient.mockResolvedValue(null); // 중복 없음
      mockShareRepo.save.mockImplementation(async (share) => share);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.createShare('user-owner', createShareDto);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockFileRepo.findById).toHaveBeenCalledWith('file-123');
      expect(mockShareRepo.save).toHaveBeenCalled();
      expect(result.fileId).toBe('file-123');
      expect(result.ownerId).toBe('user-owner');
      expect(result.recipientId).toBe('user-recipient');
      expect(result.permissions).toContain(SharePermission.VIEW);
    });

    /**
     * 🎯 검증 목적: 파일이 존재하지 않으면 에러
     */
    it('should throw NotFoundException when file does not exist', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFileRepo.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.createShare('user-owner', createShareDto),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * 🎯 검증 목적: 같은 파일을 같은 수신자에게 중복 공유 불가
     */
    it('should throw ConflictException when share already exists', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFileRepo.findById.mockResolvedValue({
        id: 'file-123',
        ownerId: 'user-owner',
      });
      mockShareRepo.findByFileAndRecipient.mockResolvedValue(
        new FileShare({
          id: 'existing-share',
          fileId: 'file-123',
          recipientId: 'user-recipient',
        }),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.createShare('user-owner', createShareDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  /**
   * 📌 테스트 시나리오: 공유 취소 (revoke)
   */
  describe('revokeShare', () => {
    /**
     * 🎯 검증 목적: 정상적인 공유 취소
     */
    it('should revoke share successfully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const existingShare = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
      });
      mockShareRepo.findById.mockResolvedValue(existingShare);
      mockShareRepo.delete.mockResolvedValue();

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.revokeShare('user-owner', 'share-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockShareRepo.delete).toHaveBeenCalledWith('share-123');
    });

    /**
     * 🎯 검증 목적: 공유가 존재하지 않으면 에러
     */
    it('should throw NotFoundException when share does not exist', async () => {
      mockShareRepo.findById.mockResolvedValue(null);

      await expect(
        service.revokeShare('user-owner', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * 🎯 검증 목적: 소유자가 아니면 취소 불가
     */
    it('should throw ForbiddenException when user is not share owner', async () => {
      const existingShare = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'other-owner', // 다른 소유자
        recipientId: 'user-recipient',
      });
      mockShareRepo.findById.mockResolvedValue(existingShare);

      await expect(
        service.revokeShare('user-owner', 'share-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * 📌 테스트 시나리오: 내가 공유한 목록 조회
   */
  describe('getMySharedFiles', () => {
    it('should return all shares created by owner', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const shares = [
        new FileShare({
          id: 'share-1',
          fileId: 'file-1',
          ownerId: 'user-owner',
          recipientId: 'recipient-1',
        }),
        new FileShare({
          id: 'share-2',
          fileId: 'file-2',
          ownerId: 'user-owner',
          recipientId: 'recipient-2',
        }),
      ];
      mockShareRepo.findByOwner.mockResolvedValue(shares);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getMySharedFiles('user-owner');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockShareRepo.findByOwner).toHaveBeenCalledWith('user-owner');
      expect(result).toHaveLength(2);
    });
  });
});
