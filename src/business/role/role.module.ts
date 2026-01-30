import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { PermissionSyncService } from './permission-sync.service';
import { RoleSyncService } from './role-sync.service';
import { RoleDomainModule } from '../../domain/role/role.module';

@Module({
  imports: [RoleDomainModule],
  providers: [RoleService, PermissionSyncService, RoleSyncService],
  exports: [RoleService]
})
export class RoleModule {}
