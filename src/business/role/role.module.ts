import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { PermissionSyncService } from './permission-sync.service';
import { RoleInfraModule } from '../../infra/database/role-infra.module';

@Module({
  imports: [RoleInfraModule],
  providers: [RoleService, PermissionSyncService],
  exports: [RoleService]
})
export class RoleModule {}
