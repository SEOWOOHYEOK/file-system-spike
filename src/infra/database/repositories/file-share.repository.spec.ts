/**
 * ============================================================
 * 📦 FileShare Repository 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FileShareRepository 클래스
 *
 * 📋 비즈니스 맥락:
 *   - FileShare 도메인 엔티티의 영속성 관리
 *   - TypeORM을 사용한 DB 작업 수행
 *
 * ⚠️ 중요 고려사항:
 *   - 실제 DB 대신 Mock Repository 사용
 *   - Mapper를 통한 도메인/ORM 변환 검증
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileShareRepository } from './file-share.repository';
import { FileShareOrmEntity } from '../entities/file-share.orm-entity';
import { FileShare } from '../../../domain/share/entities/file-share.entity';
import { SharePermission } from '../../../domain/share/share-permission.enum';

describe('FileShareRepository', () => {
  let repository: FileShareRepository;
  let mockTypeOrmRepo: jest.Mocked<Repository<FileShareOrmEntity>>;

  /**
   * 🎭 Mock 설정
   */
  beforeEach(async () => {
    mockTypeOrmRepo = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<FileShareOrmEntity>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileShareRepository,
        {
          provide: getRepositoryToken(FileShareOrmEntity),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<FileShareRepository>(FileShareRepository);
  });

  /**
   * 📌 테스트 시나리오: FileShare 저장
   */
  describe('save', () => {
    it('should save a FileShare and return domain entity', async () => {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedOrmEntity: FileShareOrmEntity = {
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW],
        maxDownloadCount: null,
        currentDownloadCount: 0,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTypeOrmRepo.save.mockResolvedValue(savedOrmEntity);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await repository.save(share);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockTypeOrmRepo.save).toHaveBeenCalled();
      expect(result).toBeInstanceOf(FileShare);
      expect(result.id).toBe('share-123');
    });
  });

  /**
   * 📌 테스트 시나리오: ID로 FileShare 조회
   */
  describe('findById', () => {
    it('should find FileShare by ID', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const ormEntity: FileShareOrmEntity = {
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW],
        maxDownloadCount: null,
        currentDownloadCount: 0,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTypeOrmRepo.findOne.mockResolvedValue(ormEntity);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await repository.findById('share-123');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'share-123' },
      });
      expect(result).toBeInstanceOf(FileShare);
    });

    it('should return null when not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);
      const result = await repository.findById('non-existent');
      expect(result).toBeNull();
    });
  });

  /**
   * 📌 테스트 시나리오: Recipient의 공유 목록 조회
   */
  describe('findByRecipient', () => {
    it('should find all shares for recipient', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const ormEntities: FileShareOrmEntity[] = [
        {
          id: 'share-1',
          fileId: 'file-1',
          ownerId: 'owner-1',
          recipientId: 'recipient-1',
          permissions: [SharePermission.VIEW],
          maxDownloadCount: null,
          currentDownloadCount: 0,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'share-2',
          fileId: 'file-2',
          ownerId: 'owner-2',
          recipientId: 'recipient-1',
          permissions: [SharePermission.DOWNLOAD],
          maxDownloadCount: 5,
          currentDownloadCount: 2,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTypeOrmRepo.find.mockResolvedValue(ormEntities);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await repository.findByRecipient('recipient-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { recipientId: 'recipient-1' },
      });
      expect(result).toHaveLength(2);
    });
  });

  /**
   * 📌 테스트 시나리오: Owner의 공유 목록 조회
   */
  describe('findByOwner', () => {
    it('should find all shares by owner', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);
      await repository.findByOwner('owner-1');
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
      });
    });
  });

  /**
   * 📌 테스트 시나리오: 파일 ID로 공유 조회
   */
  describe('findByFileId', () => {
    it('should find all shares for a file', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);
      await repository.findByFileId('file-1');
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { fileId: 'file-1' },
      });
    });
  });

  /**
   * 📌 테스트 시나리오: 파일+수신자로 공유 조회
   */
  describe('findByFileAndRecipient', () => {
    it('should find share by file and recipient', async () => {
      const ormEntity: FileShareOrmEntity = {
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW],
        maxDownloadCount: null,
        currentDownloadCount: 0,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTypeOrmRepo.findOne.mockResolvedValue(ormEntity);

      const result = await repository.findByFileAndRecipient(
        'file-456',
        'user-recipient',
      );

      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { fileId: 'file-456', recipientId: 'user-recipient' },
      });
      expect(result).toBeInstanceOf(FileShare);
    });
  });

  /**
   * 📌 테스트 시나리오: FileShare 삭제
   */
  describe('delete', () => {
    it('should delete share by ID', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 1, raw: {} });
      await repository.delete('share-123');
      expect(mockTypeOrmRepo.delete).toHaveBeenCalledWith('share-123');
    });
  });
});
