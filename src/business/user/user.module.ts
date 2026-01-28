import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserSyncService } from './user-sync.service';
import { UserQueryService } from './user-query.service';
import { UserInfraModule } from '../../infra/database/user-infra.module';
import { RoleInfraModule } from '../../infra/database/role-infra.module';
import { OrganizationModule } from '../../integrations/migration/organization/organization.module';

/**
 * User 비즈니스 모듈
 *
 * User 관련 비즈니스 로직 제공
 */
@Module({
  imports: [UserInfraModule, RoleInfraModule, OrganizationModule],
  providers: [UserService, UserSyncService, UserQueryService],
  exports: [UserService, UserSyncService, UserQueryService],
})
export class UserModule {}
