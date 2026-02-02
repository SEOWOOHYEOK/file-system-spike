import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalUserOrmEntity } from '../entities/external-user.orm-entity';
import {
  type PaginationParams,
  type PaginatedResult,
  createPaginatedResult,
} from '../../../common/types/pagination';
import { IExternalUserRepository } from '../../../domain/external-share/repositories/external-user.repository.interface';
import { ExternalUser } from '../../../domain/external-share/entities/external-user.entity';
import { ExternalUserMapper } from '../mapper/external-user.mapper';

/**
 * ExternalUser Repository 구현체
 *
 * TypeORM을 사용한 ExternalUser 영속성 관리
 */
@Injectable()
export class ExternalUserRepository implements IExternalUserRepository {
  constructor(
    @InjectRepository(ExternalUserOrmEntity)
    private readonly repo: Repository<ExternalUserOrmEntity>,
  ) {}

  async save(user: ExternalUser): Promise<ExternalUser> {
    const ormEntity = ExternalUserMapper.toOrm(user);
    const saved = await this.repo.save(ormEntity);
    return ExternalUserMapper.toDomain(saved);
  }

  async findById(id: string): Promise<ExternalUser | null> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? ExternalUserMapper.toDomain(found) : null;
  }

  async findByUsername(username: string): Promise<ExternalUser | null> {
    const found = await this.repo.findOne({ where: { username } });
    return found ? ExternalUserMapper.toDomain(found) : null;
  }

  async findByEmail(email: string): Promise<ExternalUser | null> {
    const found = await this.repo.findOne({ where: { email } });
    return found ? ExternalUserMapper.toDomain(found) : null;
  }

  async findAll(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    const { page, pageSize, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const [entities, totalItems] = await this.repo.findAndCount({
      skip,
      take: pageSize,
      order: { [sortBy]: sortOrder.toUpperCase() as 'ASC' | 'DESC' },
    });

    return createPaginatedResult(
      entities.map(ExternalUserMapper.toDomain),
      page,
      pageSize,
      totalItems,
    );
  }

  async findAllActive(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    const { page, pageSize, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const [entities, totalItems] = await this.repo.findAndCount({
      where: { isActive: true },
      skip,
      take: pageSize,
      order: { [sortBy]: sortOrder.toUpperCase() as 'ASC' | 'DESC' },
    });

    return createPaginatedResult(
      entities.map(ExternalUserMapper.toDomain),
      page,
      pageSize,
      totalItems,
    );
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
