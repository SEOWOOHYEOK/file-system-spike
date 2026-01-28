import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { PERMISSION_REPOSITORY } from '../../domain/role/repositories/permission.repository.interface';
import { PermissionEnum, PermissionDescriptions } from '../../domain/role/permission.enum';
import { Permission } from '../../domain/role/entities/permission.entity';
import type { IPermissionRepository } from '../../domain/role/repositories/permission.repository.interface';

@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepo: IPermissionRepository,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting permission synchronization...');

    const definedPermissions = Object.values(PermissionEnum);

    for (const code of definedPermissions) {
      const exists = await this.permissionRepo.findByCode(code);
      if (!exists) {
        await this.permissionRepo.save(
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
