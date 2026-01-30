import { Inject, Injectable } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../repositories/role.repository.interface';
import type { IRoleRepository } from '../repositories/role.repository.interface';
import type { Role } from '../entities/role.entity';
import type { RoleNameEnum } from '../role-name.enum';

@Injectable()
export class RoleDomainService {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repository: IRoleRepository,
  ) {}

  async 저장(role: Role): Promise<Role> {
    return this.repository.save(role);
  }

  async 조회(id: string): Promise<Role | null> {
    return this.repository.findById(id);
  }

  async 이름조회(name: RoleNameEnum | string): Promise<Role | null> {
    return this.repository.findByName(name);
  }

  async 전체조회(): Promise<Role[]> {
    return this.repository.findAll();
  }

  async 삭제(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  async 사용자별조회(userId: string): Promise<Role[]> {
    return this.repository.findByUserId(userId);
  }
}
