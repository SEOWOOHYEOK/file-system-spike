import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from '../../domain/role/dto/create-role.dto';
import { Role } from '../../domain/role/entities/role.entity';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { v4 as uuidv4 } from 'uuid';

import { RoleDomainService, PermissionDomainService } from '../../domain/role';

@Injectable()
export class RoleService {
  constructor(
    private readonly roleDomainService: RoleDomainService,
    private readonly permissionDomainService: PermissionDomainService,
  ) { }

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleDomainService.이름조회(dto.name);
    if (existing) {
      throw new ConflictException(`Role with name ${dto.name} already exists`);
    }

    const permissions = await this.permissionDomainService.코드목록조회(dto.permissionCodes);

    const role = new Role({
      id: uuidv4(),
      name: dto.name,
      description: dto.description,
      permissions: permissions
    });

    return this.roleDomainService.저장(role);
  }

  async findAll(): Promise<Role[]> {
    return this.roleDomainService.전체조회();
  }

  async findById(id: string): Promise<Role> {
    const role = await this.roleDomainService.조회(id);
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
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
}
