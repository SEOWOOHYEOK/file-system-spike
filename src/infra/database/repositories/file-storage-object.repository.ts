/**
 * FileStorageObject Repository 구현체
 * TypeORM을 사용한 파일 스토리지 객체 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileStorageObjectOrmEntity } from '../entities/file-storage-object.orm-entity';
import { IFileStorageObjectRepository } from '../../../domain/file/repositories/file.repository.interface';
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
  ): Promise<FileStorageObjectEntity | null> {
    const orm = await this.repository.findOne({
      where: { fileId, storageType },
    });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFileIdAndTypeForUpdate(
    fileId: string,
    storageType: StorageType,
  ): Promise<FileStorageObjectEntity | null> {
    const orm = await this.repository
      .createQueryBuilder('fso')
      .where('fso.fileId = :fileId', { fileId })
      .andWhere('fso.storageType = :storageType', { storageType })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findByFileId(fileId: string): Promise<FileStorageObjectEntity[]> {
    const orms = await this.repository.find({ where: { fileId } });
    return orms.map((orm) => this.toDomain(orm));
  }

  async save(storageObject: FileStorageObjectEntity): Promise<FileStorageObjectEntity> {
    const orm = this.toOrm(storageObject);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async deleteByFileId(fileId: string): Promise<void> {
    await this.repository.delete({ fileId });
  }

  async updateStatusByFileIds(
    fileIds: string[],
    storageType: StorageType,
    status: string,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(FileStorageObjectOrmEntity)
      .set({ availabilityStatus: status, updatedAt: new Date() })
      .where('fileId IN (:...fileIds)', { fileIds })
      .andWhere('storageType = :storageType', { storageType })
      .execute();
    return result.affected || 0;
  }
}
