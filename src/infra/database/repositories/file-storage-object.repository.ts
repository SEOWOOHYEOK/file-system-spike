/**
 * FileStorageObject Repository 구현체
 * TypeORM을 사용한 파일 스토리지 객체 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileStorageObjectOrmEntity } from '../entities/file-storage-object.orm-entity';
import { IFileStorageObjectRepository, TransactionOptions } from '../../../domain/file/repositories/file.repository.interface';
import {
  FileStorageObjectEntity,
  StorageType,
  AvailabilityStatus,
} from '../../../domain/storage/file/file-storage-object.entity';

@Injectable()
export class FileStorageObjectRepository implements IFileStorageObjectRepository {
  constructor(
    @InjectRepository(FileStorageObjectOrmEntity)
    private readonly repository: Repository<FileStorageObjectOrmEntity>,
  ) {}

  /**
   * 트랜잭션이 있으면 해당 매니저의 리포지토리를, 없으면 기본 리포지토리 반환
   */
  private getRepository(options?: TransactionOptions): Repository<FileStorageObjectOrmEntity> {
    return options?.queryRunner
      ? options.queryRunner.manager.getRepository(FileStorageObjectOrmEntity)
      : this.repository;
  }

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: FileStorageObjectOrmEntity): FileStorageObjectEntity {
    return new FileStorageObjectEntity({
      id: orm.id,
      fileId: orm.fileId,
      storageType: orm.storageType as StorageType,
      objectKey: orm.objectKey,
      availabilityStatus: orm.availabilityStatus as AvailabilityStatus,
      lastAccessed: orm.lastAccessed ?? undefined,
      accessCount: orm.accessCount,
      leaseCount: orm.leaseCount,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt ?? undefined,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: FileStorageObjectEntity): FileStorageObjectOrmEntity {
    const orm = new FileStorageObjectOrmEntity();
    orm.id = domain.id;
    orm.fileId = domain.fileId;
    orm.storageType = domain.storageType;
    orm.objectKey = domain.objectKey;
    orm.availabilityStatus = domain.availabilityStatus;
    orm.lastAccessed = domain.lastAccessed ?? null;
    orm.accessCount = domain.accessCount;
    orm.leaseCount = domain.leaseCount;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt ?? new Date();
    return orm;
  }

  async findByFileIdAndType(
    fileId: string,
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo.findOne({
      where: { fileId, storageType },
    });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFileIdAndTypeForUpdate(
    fileId: string,
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo
      .createQueryBuilder('fso')
      .where('fso.fileId = :fileId', { fileId })
      .andWhere('fso.storageType = :storageType', { storageType })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findByFileId(fileId: string, options?: TransactionOptions): Promise<FileStorageObjectEntity[]> {
    const repo = this.getRepository(options);
    const orms = await repo.find({ where: { fileId } });
    return orms.map((orm) => this.toDomain(orm));
  }

  async save(storageObject: FileStorageObjectEntity, options?: TransactionOptions): Promise<FileStorageObjectEntity> {
    const repo = this.getRepository(options);
    const orm = this.toOrm(storageObject);
    const saved = await repo.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete(id);
  }

  async deleteByFileId(fileId: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete({ fileId });
  }

  async updateStatusByFileIds(
    fileIds: string[],
    storageType: StorageType,
    status: string,
    options?: TransactionOptions,
  ): Promise<number> {
    const repo = this.getRepository(options);
    const result = await repo
      .createQueryBuilder()
      .update(FileStorageObjectOrmEntity)
      .set({ availabilityStatus: status, updatedAt: new Date() })
      .where('fileId IN (:...fileIds)', { fileIds })
      .andWhere('storageType = :storageType', { storageType })
      .execute();
    return result.affected || 0;
  }
}
