/**
 * File Repository 구현체
 * TypeORM을 사용한 파일 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileOrmEntity } from '../entities/file.orm-entity';
import {
  IFileRepository,
  FindFileOptions,
} from '../../../domain/file/repositories/file.repository.interface';
import { FileEntity, FileState } from '../../../domain/file/entities/file.entity';

@Injectable()
export class FileRepository implements IFileRepository {
  constructor(
    @InjectRepository(FileOrmEntity)
    private readonly repository: Repository<FileOrmEntity>,
  ) {}

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: FileOrmEntity): FileEntity {
    return new FileEntity({
      id: orm.id,
      name: orm.name,
      folderId: orm.folderId,
      sizeBytes: Number(orm.sizeBytes),
      mimeType: orm.mimeType,
      state: orm.state as FileState,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: FileEntity): FileOrmEntity {
    const orm = new FileOrmEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.folderId = domain.folderId;
    orm.sizeBytes = domain.sizeBytes;
    orm.mimeType = domain.mimeType;
    orm.state = domain.state;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }

  async findById(id: string): Promise<FileEntity | null> {
    const orm = await this.repository.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByIdForUpdate(id: string): Promise<FileEntity | null> {
    const orm = await this.repository
      .createQueryBuilder('file')
      .where('file.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findOne(options: FindFileOptions): Promise<FileEntity | null> {
    const where: any = {};
    if (options.folderId) where.folderId = options.folderId;
    if (options.name) where.name = options.name;
    if (options.mimeType) where.mimeType = options.mimeType;
    if (options.state) where.state = options.state;

    const orm = await this.repository.findOne({ where });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFolderId(folderId: string, state?: FileState): Promise<FileEntity[]> {
    const where: any = { folderId };
    if (state) where.state = state;

    const orms = await this.repository.find({ where });
    return orms.map((orm) => this.toDomain(orm));
  }

  async existsByNameInFolder(
    folderId: string,
    name: string,
    mimeType: string,
    excludeFileId?: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('file')
      .where('file.folderId = :folderId', { folderId })
      .andWhere('file.name = :name', { name })
      .andWhere('file.mimeType = :mimeType', { mimeType })
      .andWhere('file.state = :state', { state: FileState.ACTIVE });

    if (excludeFileId) {
      qb.andWhere('file.id != :excludeFileId', { excludeFileId });
    }

    const count = await qb.getCount();
    return count > 0;
  }

  async save(file: FileEntity): Promise<FileEntity> {
    const orm = this.toOrm(file);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async updateStateByFolderIds(folderIds: string[], state: FileState): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(FileOrmEntity)
      .set({ state, updatedAt: new Date() })
      .where('folderId IN (:...folderIds)', { folderIds })
      .execute();
    return result.affected || 0;
  }
}
