import { PublicShare } from '../../../domain/external-share/entities/public-share.entity';
import { PublicShareOrmEntity } from '../entities/public-share.orm-entity';

/**
 * PublicShare Mapper
 *
 * ORM 엔티티와 도메인 엔티티 간의 변환 담당
 */
export class PublicShareMapper {
  /**
   * ORM 엔티티를 도메인 엔티티로 변환
   */
  static toDomain(ormEntity: PublicShareOrmEntity): PublicShare {
    return new PublicShare({
      id: ormEntity.id,
      fileId: ormEntity.fileId,
      ownerId: ormEntity.ownerId,
      externalUserId: ormEntity.externalUserId,
      permissions: ormEntity.permissions,
      maxViewCount:
        ormEntity.maxViewCount !== null ? ormEntity.maxViewCount : undefined,
      currentViewCount: ormEntity.currentViewCount,
      maxDownloadCount:
        ormEntity.maxDownloadCount !== null
          ? ormEntity.maxDownloadCount
          : undefined,
      currentDownloadCount: ormEntity.currentDownloadCount,
      expiresAt:
        ormEntity.expiresAt !== null ? ormEntity.expiresAt : undefined,
      isBlocked: ormEntity.isBlocked,
      blockedAt:
        ormEntity.blockedAt !== null ? ormEntity.blockedAt : undefined,
      blockedBy:
        ormEntity.blockedBy !== null ? ormEntity.blockedBy : undefined,
      isRevoked: ormEntity.isRevoked,
      createdAt: ormEntity.createdAt,
      updatedAt: ormEntity.updatedAt,
    });
  }

  /**
   * 도메인 엔티티를 ORM 엔티티로 변환
   */
  static toOrm(domainEntity: PublicShare): PublicShareOrmEntity {
    const ormEntity = new PublicShareOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.fileId = domainEntity.fileId;
    ormEntity.ownerId = domainEntity.ownerId;
    ormEntity.externalUserId = domainEntity.externalUserId;
    ormEntity.permissions = domainEntity.permissions;
    ormEntity.maxViewCount = domainEntity.maxViewCount ?? null;
    ormEntity.currentViewCount = domainEntity.currentViewCount;
    ormEntity.maxDownloadCount = domainEntity.maxDownloadCount ?? null;
    ormEntity.currentDownloadCount = domainEntity.currentDownloadCount;
    ormEntity.expiresAt = domainEntity.expiresAt ?? null;
    ormEntity.isBlocked = domainEntity.isBlocked;
    ormEntity.blockedAt = domainEntity.blockedAt ?? null;
    ormEntity.blockedBy = domainEntity.blockedBy ?? null;
    ormEntity.isRevoked = domainEntity.isRevoked;
    ormEntity.createdAt = domainEntity.createdAt;
    ormEntity.updatedAt = domainEntity.updatedAt ?? new Date();
    return ormEntity;
  }
}
