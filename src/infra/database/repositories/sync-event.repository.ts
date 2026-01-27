import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SyncEventOrmEntity } from '../entities/sync-event.orm-entity';
import {
  ISyncEventRepository,
  SyncEventEntity,
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../../domain/sync-event';

/**
 * 동기화 이벤트 Repository 구현체
 */
@Injectable()
export class SyncEventRepository implements ISyncEventRepository {
  constructor(
    @InjectRepository(SyncEventOrmEntity)
    private readonly repository: Repository<SyncEventOrmEntity>,
  ) {}

  async findById(id: string): Promise<SyncEventEntity | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIds(ids: string[]): Promise<SyncEventEntity[]> {
    if (ids.length === 0) {
      return [];
    }
    const entities = await this.repository.find({
      where: { id: In(ids) },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByFileId(fileId: string): Promise<SyncEventEntity[]> {
    const entities = await this.repository.find({
      where: { fileId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByStatus(status: SyncEventStatus): Promise<SyncEventEntity[]> {
    const entities = await this.repository.find({
      where: { status },
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async save(entity: SyncEventEntity): Promise<SyncEventEntity> {
    const ormEntity = this.toOrm(entity);
    const saved = await this.repository.save(ormEntity);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async updateStatus(id: string, status: SyncEventStatus, errorMessage?: string): Promise<void> {
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

    await this.repository.update(id, updateData);
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
