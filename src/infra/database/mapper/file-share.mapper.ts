import { FileShare } from '../../../domain/share/entities/file-share.entity';
import { FileShareOrmEntity } from '../entities/file-share.orm-entity';

/**
 * FileShare Mapper
 *
 * ORM 엔티티와 도메인 엔티티 간의 변환 담당
 */
export class FileShareMapper {
  /**
   * ORM 엔티티를 도메인 엔티티로 변환
   */
  static toDomain(ormEntity: FileShareOrmEntity): FileShare {
    return new FileShare({
      id: ormEntity.id,
      fileId: ormEntity.fileId,
      ownerId: ormEntity.ownerId,
      recipientId: ormEntity.recipientId,
      permissions: ormEntity.permissions,
      maxDownloadCount:
        ormEntity.maxDownloadCount !== null
          ? ormEntity.maxDownloadCount
          : undefined,
      currentDownloadCount: ormEntity.currentDownloadCount,
      expiresAt:
        ormEntity.expiresAt !== null ? ormEntity.expiresAt : undefined,
      createdAt: ormEntity.createdAt,
      updatedAt: ormEntity.updatedAt,
    });
  }

  /**
   * 도메인 엔티티를 ORM 엔티티로 변환
   */
  static toOrm(domainEntity: FileShare): FileShareOrmEntity {
    const ormEntity = new FileShareOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.fileId = domainEntity.fileId;
    ormEntity.ownerId = domainEntity.ownerId;
    ormEntity.recipientId = domainEntity.recipientId;
    ormEntity.permissions = domainEntity.permissions;
    ormEntity.maxDownloadCount = domainEntity.maxDownloadCount ?? null;
    ormEntity.currentDownloadCount = domainEntity.currentDownloadCount;
    ormEntity.expiresAt = domainEntity.expiresAt ?? null;
    ormEntity.createdAt = domainEntity.createdAt;
    ormEntity.updatedAt = domainEntity.updatedAt;
    return ormEntity;
  }
}
