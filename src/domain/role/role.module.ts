import { Module, forwardRef } from '@nestjs/common';
import { RoleInfraModule } from '../../infra/database/role-infra.module';
import { RoleDomainService } from './service/role-domain.service';
import { PermissionDomainService } from './service/permission-domain.service';

@Module({
  imports: [forwardRef(() => RoleInfraModule)],
  providers: [RoleDomainService, PermissionDomainService],
  exports: [RoleDomainService, PermissionDomainService],
})
export class RoleDomainModule {}
