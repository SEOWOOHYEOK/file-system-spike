import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PermissionOrmEntity } from '../entities/permission.orm-entity';
import { IPermissionRepository } from '../../../domain/role/repositories/permission.repository.interface';
import { Permission } from '../../../domain/role/entities/permission.entity';
import { PermissionMapper } from '../mapper/role.mapper';

@Injectable()
export class PermissionRepository implements IPermissionRepository {
  constructor(
    @InjectRepository(PermissionOrmEntity)
    private readonly repo: Repository<PermissionOrmEntity>
  ) {}

  async save(permission: Permission): Promise<Permission> {
    const ormEntity = PermissionMapper.toOrm(permission);
    const saved = await this.repo.save(ormEntity);
    return PermissionMapper.toDomain(saved);
  }

  async findByCode(code: string): Promise<Permission | null> {
    const found = await this.repo.findOne({ where: { code } });
    return found ? PermissionMapper.toDomain(found) : null;
  }

  async findAll(): Promise<Permission[]> {
    const found = await this.repo.find();
    return found.map(PermissionMapper.toDomain);
  }

  async findByCodes(codes: string[]): Promise<Permission[]> {
    const found = await this.repo.findBy({ code: In(codes) });
    return found.map(PermissionMapper.toDomain);
  }
}
