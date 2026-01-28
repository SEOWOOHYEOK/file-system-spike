import { ExternalUser } from '../../../domain/external-share/entities/external-user.entity';
import { ExternalUserOrmEntity } from '../entities/external-user.orm-entity';

/**
 * ExternalUser Mapper
 *
 * ORM 엔티티와 도메인 엔티티 간의 변환 담당
 */
export class ExternalUserMapper {
  /**
   * ORM 엔티티를 도메인 엔티티로 변환
   */
  static toDomain(ormEntity: ExternalUserOrmEntity): ExternalUser {
    return new ExternalUser({
      id: ormEntity.id,
      username: ormEntity.username,
      passwordHash: ormEntity.passwordHash,
      name: ormEntity.name,
      email: ormEntity.email,
      company: ormEntity.company !== null ? ormEntity.company : undefined,
      phone: ormEntity.phone !== null ? ormEntity.phone : undefined,
      isActive: ormEntity.isActive,
      createdBy: ormEntity.createdBy,
      createdAt: ormEntity.createdAt,
      lastLoginAt:
        ormEntity.lastLoginAt !== null ? ormEntity.lastLoginAt : undefined,
    });
  }

  /**
   * 도메인 엔티티를 ORM 엔티티로 변환
   */
  static toOrm(domainEntity: ExternalUser): ExternalUserOrmEntity {
    const ormEntity = new ExternalUserOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.username = domainEntity.username;
    ormEntity.passwordHash = domainEntity.passwordHash;
    ormEntity.name = domainEntity.name;
    ormEntity.email = domainEntity.email;
    ormEntity.company = domainEntity.company ?? null;
    ormEntity.phone = domainEntity.phone ?? null;
    ormEntity.isActive = domainEntity.isActive;
    ormEntity.createdBy = domainEntity.createdBy;
    ormEntity.createdAt = domainEntity.createdAt;
    ormEntity.lastLoginAt = domainEntity.lastLoginAt ?? null;
    return ormEntity;
  }
}
