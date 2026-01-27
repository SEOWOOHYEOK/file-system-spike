/**
 * ============================================================
 * 📦 FileShare Mapper 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FileShareMapper 클래스
 *
 * 📋 비즈니스 맥락:
 *   - ORM 엔티티와 도메인 엔티티 간의 변환 담당
 *   - 영속성 레이어와 도메인 레이어 분리
 *
 * ⚠️ 중요 고려사항:
 *   - null 값 처리 주의 (expiresAt, maxDownloadCount)
 *   - permissions 배열 변환
 * ============================================================
 */
import { FileShareMapper } from './file-share.mapper';
import { FileShare } from '../../../domain/share/entities/file-share.entity';
import { FileShareOrmEntity } from '../entities/file-share.orm-entity';
import { SharePermission } from '../../../domain/share/share-permission.enum';

describe('FileShareMapper', () => {
  /**
   * 📌 테스트 시나리오: ORM → Domain 변환
   */
  describe('toDomain', () => {
    it('should convert ORM entity to Domain entity', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const ormEntity: FileShareOrmEntity = {
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
        maxDownloadCount: 5,
        currentDownloadCount: 2,
        expiresAt: new Date('2026-02-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-15'),
      };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const domainEntity = FileShareMapper.toDomain(ormEntity);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(domainEntity).toBeInstanceOf(FileShare);
      expect(domainEntity.id).toBe('share-123');
      expect(domainEntity.fileId).toBe('file-456');
      expect(domainEntity.permissions).toContain(SharePermission.VIEW);
      expect(domainEntity.maxDownloadCount).toBe(5);
      expect(domainEntity.currentDownloadCount).toBe(2);
    });

    it('should handle null values', () => {
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

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const domainEntity = FileShareMapper.toDomain(ormEntity);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(domainEntity.maxDownloadCount).toBeUndefined();
      expect(domainEntity.expiresAt).toBeUndefined();
    });
  });

  /**
   * 📌 테스트 시나리오: Domain → ORM 변환
   */
  describe('toOrm', () => {
    it('should convert Domain entity to ORM entity', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const domainEntity = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
        maxDownloadCount: 5,
        currentDownloadCount: 2,
        expiresAt: new Date('2026-02-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-15'),
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const ormEntity = FileShareMapper.toOrm(domainEntity);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(ormEntity.id).toBe('share-123');
      expect(ormEntity.fileId).toBe('file-456');
      expect(ormEntity.permissions).toContain(SharePermission.VIEW);
      expect(ormEntity.maxDownloadCount).toBe(5);
    });

    it('should handle undefined values as null', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const domainEntity = new FileShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        recipientId: 'user-recipient',
        permissions: [SharePermission.VIEW],
        // maxDownloadCount undefined
        // expiresAt undefined
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const ormEntity = FileShareMapper.toOrm(domainEntity);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(ormEntity.maxDownloadCount).toBeNull();
      expect(ormEntity.expiresAt).toBeNull();
    });
  });
});
