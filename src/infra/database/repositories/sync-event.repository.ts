import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { SyncEventOrmEntity } from '../entities/sync-event.orm-entity';
import {
  ISyncEventRepository,
  SyncEventEntity,
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../../domain/sync-event';
import type {
  TransactionOptions,
  SyncEventFilterParams,
} from '../../../domain/sync-event/repositories/sync-event.repository.interface';

/**
 * 동기화 이벤트 Repository 구현체
 */
@Injectable()
export class SyncEventRepository implements ISyncEventRepository {
  constructor(
    @InjectRepository(SyncEventOrmEntity)
    private readonly repository: Repository<SyncEventOrmEntity>,
  ) {}

  /**
   * 트랜잭션 옵션에 따른 Repository 반환
   */
  private getRepository(options?: TransactionOptions): Repository<SyncEventOrmEntity> {
    if (options?.queryRunner) {
      return options.queryRunner.manager.getRepository(SyncEventOrmEntity);
    }
    return this.repository;
  }

  async findById(id: string, options?: TransactionOptions): Promise<SyncEventEntity | null> {
    const repo = this.getRepository(options);
    const entity = await repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIds(ids: string[], options?: TransactionOptions): Promise<SyncEventEntity[]> {
    if (ids.length === 0) {
      return [];
    }
    const repo = this.getRepository(options);
    const entities = await repo.find({
      where: { id: In(ids) },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByFileId(fileId: string, options?: TransactionOptions): Promise<SyncEventEntity[]> {
    const repo = this.getRepository(options);
    const entities = await repo.find({
      where: { fileId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByFolderId(folderId: string, options?: TransactionOptions): Promise<SyncEventEntity[]> {
    const repo = this.getRepository(options);
    const entities = await repo.find({
      where: { folderId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByStatus(status: SyncEventStatus, options?: TransactionOptions): Promise<SyncEventEntity[]> {
    const repo = this.getRepository(options);
    const entities = await repo.find({
      where: { status },
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async save(entity: SyncEventEntity, options?: TransactionOptions): Promise<SyncEventEntity> {
    const repo = this.getRepository(options);
    const ormEntity = this.toOrm(entity);
    const saved = await repo.save(ormEntity);
    return this.toDomain(saved);
  }

  async delete(id: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete(id);
  }

  async updateStatus(id: string, status: SyncEventStatus, errorMessage?: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    const updateData: Partial<SyncEventOrmEntity> = {
      status,
      updatedAt: new Date(),
    };

    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }

    if (status === SyncEventStatus.DONE) {
      updateData.processedAt = new Date();
    }

    await repo.update(id, updateData);
  }

  async findStalePending(olderThanMs: number, options?: TransactionOptions): Promise<SyncEventEntity[]> {
    const repo = this.getRepository(options);
    const cutoffTime = new Date(Date.now() - olderThanMs);
    const entities = await repo.find({
      where: {
        status: SyncEventStatus.PENDING,
        createdAt: LessThan(cutoffTime),
      },
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async countByStatus(options?: TransactionOptions): Promise<Record<string, number>> {
    const repo = this.getRepository(options);
    const raw = await repo
      .createQueryBuilder('se')
      .select('se.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('se.status')
      .getRawMany<{ status: string; count: string }>();

    // 모든 상태를 0으로 초기화하여 호출자에게 예측 가능한 결과 제공
    const result: Record<string, number> = {
      [SyncEventStatus.PENDING]: 0,
      [SyncEventStatus.QUEUED]: 0,
      [SyncEventStatus.PROCESSING]: 0,
      [SyncEventStatus.RETRYING]: 0,
      [SyncEventStatus.DONE]: 0,
      [SyncEventStatus.FAILED]: 0,
    };
    for (const row of raw) {
      result[row.status] = parseInt(row.count, 10);
    }
    return result;
  }

  async findWithFilters(
    params: SyncEventFilterParams,
    options?: TransactionOptions,
  ): Promise<{ events: SyncEventEntity[]; total: number }> {
    const repo = this.getRepository(options);
    const qb = repo.createQueryBuilder('se');

    if (params.status !== undefined) {
      qb.andWhere('se.status = :status', { status: params.status });
    }
    if (params.eventType !== undefined) {
      qb.andWhere('se.eventType = :eventType', { eventType: params.eventType });
    }
    if (params.targetType !== undefined) {
      qb.andWhere('se.targetType = :targetType', { targetType: params.targetType });
    }
    if (params.userId !== undefined) {
      qb.andWhere('se.userId = :userId', { userId: params.userId });
    }
    if (params.fromDate !== undefined) {
      qb.andWhere('se.createdAt >= :fromDate', { fromDate: params.fromDate });
    }
    if (params.toDate !== undefined) {
      qb.andWhere('se.createdAt <= :toDate', { toDate: params.toDate });
    }

    const total = await qb.getCount();

    const ALLOWED_SORT: Record<string, string> = {
      createdAt: 'se.createdAt',
      updatedAt: 'se.updatedAt',
      status: 'se.status',
      eventType: 'se.eventType',
    };
    const sortColumn = ALLOWED_SORT[params.sortBy ?? 'createdAt'] ?? 'se.createdAt';
    const rawOrder = (params.sortOrder ?? 'desc').toLowerCase();
    const sortOrder: 'ASC' | 'DESC' = rawOrder === 'asc' ? 'ASC' : 'DESC';

    const offset = (params.page - 1) * params.pageSize;
    const entities = await qb
      .orderBy(sortColumn, sortOrder)
      .skip(offset)
      .take(params.pageSize)
      .getMany();

    return {
      events: entities.map((e) => this.toDomain(e)),
      total,
    };
  }

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: SyncEventOrmEntity): SyncEventEntity {
    return new SyncEventEntity({
      id: orm.id,
      eventType: orm.eventType as SyncEventType,
      targetType: orm.targetType as SyncEventTargetType,
      fileId: orm.fileId || undefined,
      folderId: orm.folderId || undefined,
      sourcePath: orm.sourcePath,
      targetPath: orm.targetPath,
      status: orm.status as SyncEventStatus,
      processBy: orm.userId,
      retryCount: orm.retryCount,
      maxRetries: orm.maxRetries,
      errorMessage: orm.errorMessage || undefined,
      metadata: orm.metadata || undefined,
      processedAt: orm.processedAt || undefined,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: SyncEventEntity): SyncEventOrmEntity {
    const orm = new SyncEventOrmEntity();
    orm.id = domain.id;
    orm.eventType = domain.eventType;
    orm.targetType = domain.targetType;
    orm.fileId = domain.fileId || null;
    orm.folderId = domain.folderId || null;
    orm.sourcePath = domain.sourcePath;
    orm.targetPath = domain.targetPath;
    orm.status = domain.status;
    orm.userId = domain.processBy;
    orm.retryCount = domain.retryCount;
    orm.maxRetries = domain.maxRetries;
    orm.errorMessage = domain.errorMessage || null;
    orm.metadata = domain.metadata || null;
    orm.processedAt = domain.processedAt || null;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }
}
