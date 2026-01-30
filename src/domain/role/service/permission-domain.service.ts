import { Inject, Injectable } from '@nestjs/common';
import { PERMISSION_REPOSITORY } from '../repositories/permission.repository.interface';
import type { IPermissionRepository } from '../repositories/permission.repository.interface';
import type { Permission } from '../entities/permission.entity';

@Injectable()
export class PermissionDomainService {
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly repository: IPermissionRepository,
  ) {}

  async 저장(permission: Permission): Promise<Permission> {
    return this.repository.save(permission);
  }

  async 코드조회(code: string): Promise<Permission | null> {
    return this.repository.findByCode(code);
  }

  async 전체조회(): Promise<Permission[]> {
    return this.repository.findAll();
  }

  async 코드목록조회(codes: string[]): Promise<Permission[]> {
    return this.repository.findByCodes(codes);
  }
}
