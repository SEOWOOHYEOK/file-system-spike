/**
 * File Repository 구현체
 * TypeORM을 사용한 파일 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FileOrmEntity } from '../entities/file.orm-entity';
import {
  IFileRepository,
  FindFileOptions,
  TransactionOptions,
} from '../../../domain/file/repositories/file.repository.interface';
import { FileEntity } from '../../../domain/file/entities/file.entity';
import { FileState } from '../../../domain/file/type/file.type';

@Injectable()
export class FileRepository implements IFileRepository {
  constructor(
    @InjectRepository(FileOrmEntity)
    private readonly repository: Repository<FileOrmEntity>,
  ) {}

  /**
   * 트랜잭션이 있으면 해당 매니저의 리포지토리를, 없으면 기본 리포지토리 반환
   */
  private getRepository(options?: TransactionOptions): Repository<FileOrmEntity> {
    return options?.queryRunner
      ? options.queryRunner.manager.getRepository(FileOrmEntity)
      : this.repository;
  }

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
      createdBy: orm.createdBy,
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
    orm.createdBy = domain.createdBy;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }

  async findById(id: string, options?: TransactionOptions): Promise<FileEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByIds(ids: string[], options?: TransactionOptions): Promise<FileEntity[]> {
    if (ids.length === 0) return [];
    const repo = this.getRepository(options);
    const orms = await repo.find({ where: { id: In(ids) } });
    return orms.map((orm) => this.toDomain(orm));
  }

  async findByIdForUpdate(id: string, options?: TransactionOptions): Promise<FileEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo
      .createQueryBuilder('file')
      .where('file.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findOne(findOptions: FindFileOptions, options?: TransactionOptions): Promise<FileEntity | null> {
    const repo = this.getRepository(options);
    const where: any = {};
    if (findOptions.folderId) where.folderId = findOptions.folderId;
    if (findOptions.name) where.name = findOptions.name;
    if (findOptions.mimeType) where.mimeType = findOptions.mimeType;
    if (findOptions.state) where.state = findOptions.state;

    const orm = await repo.findOne({ where });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFolderId(folderId: string, state?: FileState, options?: TransactionOptions): Promise<FileEntity[]> {
    const repo = this.getRepository(options);
    const where: any = { folderId };
    if (state) where.state = state;

    const orms = await repo.find({ where });
    return orms.map((orm) => this.toDomain(orm));
  }

  //동일 파일 체크 로직
  async existsByNameInFolder(
    folderId: string,
    name: string,
    mimeType: string,
    excludeFileId?: string,
    options?: TransactionOptions,
    createdAt?: Date,
  ): Promise<boolean> {
    const repo = this.getRepository(options);
    const qb = repo
      .createQueryBuilder('file')
      .where('file.folderId = :folderId', { folderId })
      .andWhere('file.name = :name', { name })
      .andWhere('file.mimeType = :mimeType', { mimeType })
      .andWhere('file.state = :state', { state: FileState.ACTIVE });

    if (excludeFileId) {
      qb.andWhere('file.id != :excludeFileId', { excludeFileId });
    }

    if (createdAt) {
      qb.andWhere('file.createdAt = :createdAt', { createdAt });
    }

    const count = await qb.getCount();
    return count > 0;
  }

  async save(file: FileEntity, options?: TransactionOptions): Promise<FileEntity> {
    const repo = this.getRepository(options);
    const orm = this.toOrm(file);
    const saved = await repo.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete(id);
  }

  async updateStateByFolderIds(folderIds: string[], state: FileState, options?: TransactionOptions): Promise<number> {
    const repo = this.getRepository(options);
    const result = await repo
      .createQueryBuilder()
      .update(FileOrmEntity)
      .set({ state, updatedAt: new Date() })
      .where('folderId IN (:...folderIds)', { folderIds })
      .execute();
    return result.affected || 0;
  }

  async searchByNamePattern(
    namePattern: string,
    limit: number,
    offset: number,
  ): Promise<{ items: FileEntity[]; total: number }> {
    const qb = this.repository
      .createQueryBuilder('file')
      .where('file.name LIKE :pattern', { pattern: `%${namePattern}%` })
      .andWhere('file.state = :state', { state: FileState.ACTIVE });

    // 총 개수 조회
    const total = await qb.getCount();

    // 페이지네이션 적용하여 결과 조회
    const orms = await qb
      .orderBy('file.updatedAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return {
      items: orms.map((orm) => this.toDomain(orm)),
      total,
    };
  }
}
