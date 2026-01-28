import {
  ShareAccessLog,
  AccessAction,
} from '../../../domain/external-share/entities/share-access-log.entity';
import { ShareAccessLogOrmEntity } from '../entities/share-access-log.orm-entity';

/**
 * ShareAccessLog Mapper
 *
 * ORM 엔티티와 도메인 엔티티 간의 변환 담당
 */
export class ShareAccessLogMapper {
  /**
   * ORM 엔티티를 도메인 엔티티로 변환
   */
  static toDomain(ormEntity: ShareAccessLogOrmEntity): ShareAccessLog {
    return new ShareAccessLog({
      id: ormEntity.id,
      publicShareId: ormEntity.publicShareId,
      externalUserId: ormEntity.externalUserId,
      action: ormEntity.action as AccessAction,
      ipAddress: ormEntity.ipAddress,
      userAgent: ormEntity.userAgent,
      deviceType: ormEntity.deviceType,
      accessedAt: ormEntity.accessedAt,
      success: ormEntity.success,
      failReason:
        ormEntity.failReason !== null ? ormEntity.failReason : undefined,
    });
  }

  /**
   * 도메인 엔티티를 ORM 엔티티로 변환
   */
  static toOrm(domainEntity: ShareAccessLog): ShareAccessLogOrmEntity {
    const ormEntity = new ShareAccessLogOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.publicShareId = domainEntity.publicShareId;
    ormEntity.externalUserId = domainEntity.externalUserId;
    ormEntity.action = domainEntity.action;
    ormEntity.ipAddress = domainEntity.ipAddress;
    ormEntity.userAgent = domainEntity.userAgent;
    ormEntity.deviceType = domainEntity.deviceType;
    ormEntity.accessedAt = domainEntity.accessedAt;
    ormEntity.success = domainEntity.success;
    ormEntity.failReason = domainEntity.failReason ?? null;
    return ormEntity;
  }
}
