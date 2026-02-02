/**
 * FolderStorageObject Repository 구현체
 * TypeORM을 사용한 폴더 스토리지 객체 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FolderStorageObjectOrmEntity } from '../entities/folder-storage-object.orm-entity';
import {
  IFolderStorageObjectRepository,
  TransactionOptions,
} from '../../../domain/storage/folder/repositories/folder-storage-object.repository.interface';
import {
  FolderStorageObjectEntity,
  FolderAvailabilityStatus,
} from '../../../domain/storage/folder/entity/folder-storage-object.entity';

@Injectable()
export class FolderStorageObjectRepository implements IFolderStorageObjectRepository {
  constructor(
    @InjectRepository(FolderStorageObjectOrmEntity)
    private readonly repository: Repository<FolderStorageObjectOrmEntity>,
  ) {}

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: FolderStorageObjectOrmEntity): FolderStorageObjectEntity {
    return new FolderStorageObjectEntity({
      id: orm.id,
      folderId: orm.folderId,
      storageType: orm.storageType,
      objectKey: orm.objectKey,
      availabilityStatus: orm.availabilityStatus as FolderAvailabilityStatus,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt ?? undefined,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: FolderStorageObjectEntity): FolderStorageObjectOrmEntity {
    const orm = new FolderStorageObjectOrmEntity();
    orm.id = domain.id;
    orm.folderId = domain.folderId;
    orm.storageType = domain.storageType;
    orm.objectKey = domain.objectKey;
    orm.availabilityStatus = domain.availabilityStatus;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt ?? new Date();
    return orm;
  }

  async findByFolderId(folderId: string, options?: TransactionOptions): Promise<FolderStorageObjectEntity | null> {
    const repo = options?.queryRunner
      ? options.queryRunner.manager.getRepository(FolderStorageObjectOrmEntity)
      : this.repository;
    const orm = await repo.findOne({ where: { folderId } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFolderIdForUpdate(folderId: string, options?: TransactionOptions): Promise<FolderStorageObjectEntity | null> {
    const repo = options?.queryRunner
      ? options.queryRunner.manager.getRepository(FolderStorageObjectOrmEntity)
      : this.repository;
    const orm = await repo
      .createQueryBuilder('fso')
      .where('fso.folderId = :folderId', { folderId })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findByObjectKeyPrefix(prefix: string, options?: TransactionOptions): Promise<FolderStorageObjectEntity[]> {
    const repo = options?.queryRunner
      ? options.queryRunner.manager.getRepository(FolderStorageObjectOrmEntity)
      : this.repository;
    const orms = await repo
      .createQueryBuilder('fso')
      .where('fso.objectKey LIKE :prefix', { prefix: `${prefix}%` })
      .getMany();
    return orms.map(orm => this.toDomain(orm));
  }

  async save(storageObject: FolderStorageObjectEntity, options?: TransactionOptions): Promise<FolderStorageObjectEntity> {
    const repo = options?.queryRunner
      ? options.queryRunner.manager.getRepository(FolderStorageObjectOrmEntity)
      : this.repository;
    const orm = this.toOrm(storageObject);
    const saved = await repo.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async deleteByFolderId(folderId: string): Promise<void> {
    await this.repository.delete({ folderId });
  }

  async updateStatusByFolderIds(folderIds: string[], status: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(FolderStorageObjectOrmEntity)
      .set({ availabilityStatus: status, updatedAt: new Date() })
      .where('folderId IN (:...folderIds)', { folderIds })
      .execute();
    return result.affected || 0;
  }
}
