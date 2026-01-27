import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleOrmEntity } from './entities/role.orm-entity';
import { PermissionOrmEntity } from './entities/permission.orm-entity';
import { UserOrmEntity } from './entities/user.orm-entity';
import { RoleRepository } from './repositories/role.repository';
import { PermissionRepository } from './repositories/permission.repository';
import { ROLE_REPOSITORY } from '../../domain/role/repositories/role.repository.interface';
import { PERMISSION_REPOSITORY } from '../../domain/role/repositories/permission.repository.interface';

/**
 * Role 인프라 모듈
 *
 * Role, Permission 영속성 관련 구현체 제공
 * User 테이블 기반으로 Role 조회 (UserRole 테이블 제거됨)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      PermissionOrmEntity,
      UserOrmEntity, // findByUserId에서 User 테이블 참조
    ]),
  ],
  providers: [
    {
      provide: ROLE_REPOSITORY,
      useClass: RoleRepository,
    },
    {
      provide: PERMISSION_REPOSITORY,
      useClass: PermissionRepository,
    },
  ],
  exports: [ROLE_REPOSITORY, PERMISSION_REPOSITORY, TypeOrmModule],
})
export class RoleInfraModule {}
