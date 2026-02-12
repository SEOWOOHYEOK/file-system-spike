import { Injectable } from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { CreateRoleDto } from '../../domain/role/dto/create-role.dto';
import { Role } from '../../domain/role/entities/role.entity';
import { Permission } from '../../domain/role/entities/permission.entity';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { v4 as uuidv4 } from 'uuid';

import { RoleDomainService, PermissionDomainService } from '../../domain/role';

@Injectable()
export class RoleService {
  constructor(
    private readonly roleDomainService: RoleDomainService,
    private readonly permissionDomainService: PermissionDomainService,
  ) {}

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleDomainService.이름조회(dto.name);
    if (existing) {
      throw BusinessException.of(ErrorCodes.ROLE_DUPLICATE_NAME, { name: dto.name });
    }

    const permissions = await this.permissionDomainService.코드목록조회(dto.permissionCodes);

    const role = new Role({
      id: uuidv4(),
      name: dto.name,
      description: dto.description,
      permissions: permissions,
    });

    return this.roleDomainService.저장(role);
  }

  async findAll(): Promise<Role[]> {
    return this.roleDomainService.전체조회();
  }

  async findById(id: string): Promise<Role> {
    const role = await this.roleDomainService.조회(id);
    if (!role) {
      throw BusinessException.of(ErrorCodes.ROLE_NOT_FOUND, { roleId: id });
    }
    return role;
  }

  async delete(id: string): Promise<void> {
    await this.roleDomainService.삭제(id);
  }

  async getUserPermissions(userId: string): Promise<PermissionEnum[]> {
    const roles = await this.roleDomainService.사용자별조회(userId);
    const permissions = new Set<PermissionEnum>();

    for (const role of roles) {
      for (const permission of role.permissions) {
        permissions.add(permission.code as PermissionEnum);
      }
    }

    return Array.from(permissions);
  }

  /**
   * 역할에 권한 추가
   */
  async addPermissionToRole(roleId: string, permissionCode: PermissionEnum): Promise<Role> {
    const role = await this.roleDomainService.조회(roleId);
    if (!role) {
      throw BusinessException.of(ErrorCodes.ROLE_NOT_FOUND, { roleId });
    }

    const permission = await this.permissionDomainService.코드조회(permissionCode);
    if (!permission) {
      throw BusinessException.of(ErrorCodes.PERMISSION_NOT_FOUND, { permissionCode });
    }

    const alreadyAssigned = role.permissions.some((p) => p.code === permissionCode);
    if (alreadyAssigned) {
      throw BusinessException.of(ErrorCodes.PERMISSION_ALREADY_ASSIGNED, {
        roleId,
        permissionCode,
      });
    }

    role.permissions.push(permission);
    return this.roleDomainService.저장(role);
  }

  /**
   * 역할에서 권한 제거
   */
  async removePermissionFromRole(roleId: string, permissionCode: PermissionEnum): Promise<Role> {
    const role = await this.roleDomainService.조회(roleId);
    if (!role) {
      throw BusinessException.of(ErrorCodes.ROLE_NOT_FOUND, { roleId });
    }

    const permissionIndex = role.permissions.findIndex((p) => p.code === permissionCode);
    if (permissionIndex === -1) {
      throw BusinessException.of(ErrorCodes.PERMISSION_NOT_ASSIGNED, {
        roleId,
        permissionCode,
      });
    }

    role.permissions.splice(permissionIndex, 1);
    return this.roleDomainService.저장(role);
  }

  /**
   * 시스템 전체 권한 목록 조회
   */
  async findAllPermissions(): Promise<Permission[]> {
    return this.permissionDomainService.전체조회();
  }
}
