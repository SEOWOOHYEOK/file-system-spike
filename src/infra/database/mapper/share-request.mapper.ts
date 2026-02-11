import { ShareRequest } from '../../../domain/share-request/entities/share-request.entity';
import { ShareRequestOrmEntity } from '../entities/share-request.orm-entity';
import { ShareTarget } from '../../../domain/share-request/type/share-target.type';
import { Permission } from '../../../domain/share-request/type/share-permission.type';

/**
 * ShareRequest Mapper
 *
 * ORM 엔티티와 도메인 엔티티 간의 변환 담당
 */
export class ShareRequestMapper {
  /**
   * ORM 엔티티를 도메인 엔티티로 변환
   */
  static toDomain(ormEntity: ShareRequestOrmEntity): ShareRequest {
    return new ShareRequest({
      id: ormEntity.id,
      status: ormEntity.status as any,
      fileIds: ormEntity.fileIds,
      requesterId: ormEntity.requesterId,
      targets: ormEntity.targets as ShareTarget[],
      permission: ormEntity.permission as Permission,
      startAt: ormEntity.startAt,
      endAt: ormEntity.endAt,
      reason: ormEntity.reason,
      designatedApproverId: ormEntity.designatedApproverId,
      approverId:
        ormEntity.approverId !== null ? ormEntity.approverId : undefined,
      decidedAt:
        ormEntity.decidedAt !== null ? ormEntity.decidedAt : undefined,
      decisionComment:
        ormEntity.decisionComment !== null
          ? ormEntity.decisionComment
          : undefined,
      isAutoApproved: ormEntity.isAutoApproved,
      publicShareIds: ormEntity.publicShareIds,
      requestedAt: ormEntity.requestedAt,
      updatedAt:
        ormEntity.updatedAt !== null ? ormEntity.updatedAt : undefined,
    });
  }

  /**
   * 도메인 엔티티를 ORM 엔티티로 변환
   */
  static toOrm(domainEntity: ShareRequest): ShareRequestOrmEntity {
    const ormEntity = new ShareRequestOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.status = domainEntity.status;
    ormEntity.fileIds = domainEntity.fileIds;
    ormEntity.requesterId = domainEntity.requesterId;
    ormEntity.targets = domainEntity.targets as any;
    ormEntity.permission = domainEntity.permission as any;
    ormEntity.startAt = domainEntity.startAt;
    ormEntity.endAt = domainEntity.endAt;
    ormEntity.reason = domainEntity.reason;
    ormEntity.designatedApproverId = domainEntity.designatedApproverId;
    ormEntity.approverId = domainEntity.approverId ?? null;
    ormEntity.decidedAt = domainEntity.decidedAt ?? null;
    ormEntity.decisionComment = domainEntity.decisionComment ?? null;
    ormEntity.isAutoApproved = domainEntity.isAutoApproved;
    ormEntity.publicShareIds = domainEntity.publicShareIds;
    ormEntity.requestedAt = domainEntity.requestedAt;
    ormEntity.updatedAt = domainEntity.updatedAt ?? null;
    return ormEntity;
  }
}
