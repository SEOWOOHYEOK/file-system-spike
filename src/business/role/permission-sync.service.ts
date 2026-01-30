import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PermissionEnum, PermissionDescriptions } from '../../domain/role/permission.enum';
import { Permission } from '../../domain/role/entities/permission.entity';
import { PermissionDomainService } from '../../domain/role';

@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    private readonly permissionDomainService: PermissionDomainService,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting permission synchronization...');

    const definedPermissions = Object.values(PermissionEnum);

    for (const code of definedPermissions) {
      const exists = await this.permissionDomainService.코드조회(code);
      if (!exists) {
        await this.permissionDomainService.저장(
          new Permission({
            code,
            description: PermissionDescriptions[code],
          }),
        );
        this.logger.log(`Created permission: ${code} (${PermissionDescriptions[code]})`);
      }
    }

    this.logger.log('Permission synchronization completed');
  }
}
