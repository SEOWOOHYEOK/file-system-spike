import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { SystemConfigOrmEntity } from '../entities/system-config.orm-entity';
import { SystemConfigEntity } from '../../../domain/system-config/entities/system-config.entity';
import type { ISystemConfigRepository } from '../../../domain/system-config/repositories/system-config.repository.interface';

@Injectable()
export class SystemConfigRepository implements ISystemConfigRepository {
  constructor(
    @InjectRepository(SystemConfigOrmEntity)
    private readonly repository: Repository<SystemConfigOrmEntity>,
  ) {}

  private toDomain(orm: SystemConfigOrmEntity): SystemConfigEntity {
    return new SystemConfigEntity({
      id: orm.id,
      key: orm.key,
      value: orm.value,
      description: orm.description,
      updatedAt: orm.updatedAt,
      updatedBy: orm.updatedBy,
    });
  }

  private toOrm(domain: SystemConfigEntity): SystemConfigOrmEntity {
    const orm = new SystemConfigOrmEntity();
    orm.id = domain.id;
    orm.key = domain.key;
    orm.value = domain.value;
    orm.description = domain.description;
    orm.updatedAt = domain.updatedAt;
    orm.updatedBy = domain.updatedBy;
    return orm;
  }

  async findByKey(key: string): Promise<SystemConfigEntity | null> {
    const orm = await this.repository.findOne({ where: { key } });
    return orm ? this.toDomain(orm) : null;
  }

  async findAll(): Promise<SystemConfigEntity[]> {
    const orms = await this.repository.find({ order: { key: 'ASC' } });
    return orms.map((o) => this.toDomain(o));
  }

  async findByKeyPrefix(prefix: string): Promise<SystemConfigEntity[]> {
    const orms = await this.repository.find({
      where: { key: Like(`${prefix}%`) },
      order: { key: 'ASC' },
    });
    return orms.map((o) => this.toDomain(o));
  }

  async save(entity: SystemConfigEntity): Promise<SystemConfigEntity> {
    const orm = this.toOrm(entity);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }
}
