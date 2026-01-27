import { Role } from '../entities/role.entity';

export interface IRoleRepository {
  save(role: Role): Promise<Role>;
  findById(id: string): Promise<Role | null>;
  findByName(name: string): Promise<Role | null>;
  findAll(): Promise<Role[]>;
  delete(id: string): Promise<void>;
  findByUserId(userId: string): Promise<Role[]>;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
