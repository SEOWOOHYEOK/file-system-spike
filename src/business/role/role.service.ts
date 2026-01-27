import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../domain/role/repositories/role.repository.interface';
import { PERMISSION_REPOSITORY } from '../../domain/role/repositories/permission.repository.interface';
import { CreateRoleDto } from '../../domain/role/dto/create-role.dto';
import { Role } from '../../domain/role/entities/role.entity';
import { PermissionEnum } from '../../domain/role/permission.enum';
import { v4 as uuidv4 } from 'uuid';

import type { IRoleRepository } from '../../domain/role/repositories/role.repository.interface';
import type { IPermissionRepository } from '../../domain/role/repositories/permission.repository.interface';

@Injectable()
export class RoleService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    @Inject(PERMISSION_REPOSITORY) private readonly permRepo: IPermissionRepository,
  ) { }

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleRepo.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Role with name ${dto.name} already exists`);
    }

    const permissions = await this.permRepo.findByCodes(dto.permissionCodes);

    const role = new Role({
      id: uuidv4(),
      name: dto.name,
      description: dto.description,
      permissions: permissions
    });

    return this.roleRepo.save(role);
  }

  async findAll(): Promise<Role[]> {
    return this.roleRepo.findAll();
  }

  async findById(id: string): Promise<Role> {
    const role = await this.roleRepo.findById(id);
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async delete(id: string): Promise<void> {
    await this.roleRepo.delete(id);
  }

  async getUserPermissions(userId: string): Promise<PermissionEnum[]> {
    const roles = await this.roleRepo.findByUserId(userId);
    const permissions = new Set<PermissionEnum>();

    for (const role of roles) {
      for (const permission of role.permissions) {
        permissions.add(permission.code as PermissionEnum);
      }
    }

    return Array.from(permissions);
  }
}
