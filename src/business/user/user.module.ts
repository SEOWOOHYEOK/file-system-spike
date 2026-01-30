import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserSyncService } from './user-sync.service';
import { UserQueryService } from './user-query.service';
import { UserDomainModule } from '../../domain/user/user.module';
import { RoleDomainModule } from '../../domain/role/role.module';
import { OrganizationModule } from '../../integrations/migration/organization/organization.module';

/**
 * User 비즈니스 모듈
 *
 * User 관련 비즈니스 로직 제공
 */
@Module({
  imports: [UserDomainModule, RoleDomainModule, OrganizationModule],
  providers: [UserService, UserSyncService, UserQueryService],
  exports: [UserService, UserSyncService, UserQueryService],
})
export class UserModule {}
