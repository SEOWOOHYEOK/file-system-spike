import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../domain/role/repositories/role.repository.interface';
import { PERMISSION_REPOSITORY } from '../../domain/role/repositories/permission.repository.interface';
import { RoleNameEnum, RoleDescriptions } from '../../domain/role/role-name.enum';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { Role } from '../../domain/role/entities/role.entity';
import { v4 as uuidv4 } from 'uuid';

import type { IRoleRepository } from '../../domain/role/repositories/role.repository.interface';
import type { IPermissionRepository } from '../../domain/role/repositories/permission.repository.interface';

/**
 * 역할별 기본 권한 매핑
 *
 * RoleNameEnum에 새 역할 추가 시 여기에도 권한 매핑 추가 필요
 */
const RolePermissions: Record<RoleNameEnum, PermissionEnum[]> = {
  [RoleNameEnum.ADMIN]: Object.values(PermissionEnum), // 모든 권한
  [RoleNameEnum.MANAGER]: [
    PermissionEnum.USER_READ,
    PermissionEnum.ROLE_READ,
    PermissionEnum.FILE_READ,
    PermissionEnum.FILE_WRITE,
    PermissionEnum.FILE_DELETE,
    PermissionEnum.FILE_SHARE_CREATE,
    PermissionEnum.FILE_SHARE_READ,
    PermissionEnum.FILE_SHARE_DELETE,
    PermissionEnum.FOLDER_READ,
    PermissionEnum.FOLDER_WRITE,
    PermissionEnum.FOLDER_DELETE,
  ],
  [RoleNameEnum.USER]: [
    PermissionEnum.FILE_READ,
    PermissionEnum.FILE_WRITE,
    PermissionEnum.FILE_DELETE,
    PermissionEnum.FILE_SHARE_CREATE,
    PermissionEnum.FILE_SHARE_READ,
    PermissionEnum.FOLDER_READ,
    PermissionEnum.FOLDER_WRITE,
  ],
};

/**
 * Role 자동 동기화 서비스
 *
 * 앱 시작 시 RoleNameEnum에 정의된 역할들을 DB에 자동 생성
 */
@Injectable()
export class RoleSyncService implements OnModuleInit {
  private readonly logger = new Logger(RoleSyncService.name);


  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepo: IRoleRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepo: IPermissionRepository,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting role synchronization...');

    for (const roleName of Object.values(RoleNameEnum)) {
      await this.syncRole(roleName);
    }

    this.logger.log('Role synchronization completed');
  }

  private async syncRole(roleName: RoleNameEnum): Promise<void> {
    const existing = await this.roleRepo.findByName(roleName);

    if (existing) {
      this.logger.debug(`Role ${roleName} already exists, skipping`);
      return;
    }

  
    // 해당 역할의 권한들 조회
    const permissionCodes = RolePermissions[roleName];
    const permissions = await Promise.all(
      permissionCodes.map((code) => this.permissionRepo.findByCode(code)),
    );

    const validPermissions = permissions.filter((p) => p !== null);

    const role = new Role({
      id: uuidv4(),
      name: roleName,
      description: RoleDescriptions[roleName],
      permissions: validPermissions,
    });

    await this.roleRepo.save(role);
    this.logger.log(`Created role: ${roleName} with ${validPermissions.length} permissions`);
  }
}
