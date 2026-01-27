import { Permission } from '../entities/permission.entity';

export interface IPermissionRepository {
  save(permission: Permission): Promise<Permission>;
  findByCode(code: string): Promise<Permission | null>;
  findAll(): Promise<Permission[]>;
  findByCodes(codes: string[]): Promise<Permission[]>;
}

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');
