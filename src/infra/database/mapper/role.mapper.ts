import { Role } from '../../../domain/role/entities/role.entity';
import { Permission } from '../../../domain/role/entities/permission.entity';
import { RoleOrmEntity } from '../entities/role.orm-entity';
import { PermissionOrmEntity } from '../entities/permission.orm-entity';

export class RoleMapper {
  static toDomain(ormEntity: RoleOrmEntity): Role {
    return new Role({
      id: ormEntity.id,
      name: ormEntity.name,
      description: ormEntity.description,
      permissions: ormEntity.permissions?.map(p => new Permission({
        id: p.id,
        code: p.code,
        description: p.description
      })) || []
    });
  }

  static toOrm(domainEntity: Role): RoleOrmEntity {
    const ormEntity = new RoleOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.name = domainEntity.name;
    ormEntity.description = domainEntity?.description || '';
    ormEntity.permissions = domainEntity.permissions?.map(p => {
      const perm = new PermissionOrmEntity();
      perm.id = p.id;
      perm.code = p.code;
      perm.description = p?.description || '';
      return perm;
    }) || [];
    return ormEntity;
  }
}

export class PermissionMapper {
  static toDomain(ormEntity: PermissionOrmEntity): Permission {
    return new Permission({
      id: ormEntity.id,
      code: ormEntity.code,
      description: ormEntity.description
    });
  }

  static toOrm(domainEntity: Permission): PermissionOrmEntity {
    const ormEntity = new PermissionOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.code = domainEntity.code;
    ormEntity.description = domainEntity?.description || '';
    return ormEntity;
  }
}
