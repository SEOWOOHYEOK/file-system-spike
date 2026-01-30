import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { ShareAccessLogOrmEntity } from '../entities/share-access-log.orm-entity';
import {
  IShareAccessLogRepository,
  AccessLogFilter,
} from '../../../domain/external-share/repositories/share-access-log.repository.interface';
import type { PaginationParams, PaginatedResult } from '../../../common/types/pagination';
import { ShareAccessLog } from '../../../domain/external-share/entities/share-access-log.entity';
import { ShareAccessLogMapper } from '../mapper/share-access-log.mapper';

/**
 * ShareAccessLog Repository 구현체
 *
 * TypeORM을 사용한 ShareAccessLog 영속성 관리
 */
@Injectable()
export class ShareAccessLogRepository implements IShareAccessLogRepository {
  constructor(
    @InjectRepository(ShareAccessLogOrmEntity)
    private readonly repo: Repository<ShareAccessLogOrmEntity>,
  ) {}

  async save(log: ShareAccessLog): Promise<ShareAccessLog> {
    const ormEntity = ShareAccessLogMapper.toOrm(log);
    const saved = await this.repo.save(ormEntity);
    return ShareAccessLogMapper.toDomain(saved);
  }

  async findById(id: string): Promise<ShareAccessLog | null> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? ShareAccessLogMapper.toDomain(found) : null;
  }

  async findByShareId(
    publicShareId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareAccessLog>> {
    const { page, pageSize, sortBy = 'accessedAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const [entities, totalItems] = await this.repo.findAndCount({
      where: { publicShareId },
      skip,
      take: pageSize,
      order: { [sortBy]: sortOrder.toUpperCase() as 'ASC' | 'DESC' },
    });

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: entities.map(ShareAccessLogMapper.toDomain),
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async findByExternalUserId(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareAccessLog>> {
    const { page, pageSize, sortBy = 'accessedAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const [entities, totalItems] = await this.repo.findAndCount({
      where: { externalUserId },
      skip,
      take: pageSize,
      order: { [sortBy]: sortOrder.toUpperCase() as 'ASC' | 'DESC' },
    });

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: entities.map(ShareAccessLogMapper.toDomain),
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async findAll(
    pagination: PaginationParams,
    filter?: AccessLogFilter,
  ): Promise<PaginatedResult<ShareAccessLog>> {
    const { page, pageSize, sortBy = 'accessedAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const where: FindOptionsWhere<ShareAccessLogOrmEntity> = {};

    if (filter) {
      if (filter.publicShareId) where.publicShareId = filter.publicShareId;
      if (filter.externalUserId) where.externalUserId = filter.externalUserId;
      if (filter.action) where.action = filter.action;
      if (filter.success !== undefined) where.success = filter.success;
    }

    const queryBuilder = this.repo.createQueryBuilder('log');

    // Basic where conditions
    if (filter?.publicShareId) {
      queryBuilder.andWhere('log.publicShareId = :publicShareId', {
        publicShareId: filter.publicShareId,
      });
    }
    if (filter?.externalUserId) {
      queryBuilder.andWhere('log.externalUserId = :externalUserId', {
        externalUserId: filter.externalUserId,
      });
    }
    if (filter?.action) {
      queryBuilder.andWhere('log.action = :action', { action: filter.action });
    }
    if (filter?.success !== undefined) {
      queryBuilder.andWhere('log.success = :success', { success: filter.success });
    }

    // Date range filters
    if (filter?.startDate) {
      queryBuilder.andWhere('log.accessedAt >= :startDate', {
        startDate: filter.startDate,
      });
    }
    if (filter?.endDate) {
      queryBuilder.andWhere('log.accessedAt <= :endDate', {
        endDate: filter.endDate,
      });
    }

    const [entities, totalItems] = await queryBuilder
      .orderBy(`log.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: entities.map(ShareAccessLogMapper.toDomain),
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
