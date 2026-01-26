/**
 * Folder Repository 구현체
 * TypeORM을 사용한 폴더 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FolderOrmEntity } from '../entities/folder.orm-entity';
import { FileOrmEntity } from '../entities/file.orm-entity';
import {
  IFolderRepository,
  FindFolderOptions,
  TransactionOptions,
} from '../../../domain/folder/repositories/folder.repository.interface';
import { FolderEntity, FolderState } from '../../../domain/folder/entities/folder.entity';

@Injectable()
export class FolderRepository implements IFolderRepository {
  constructor(
    @InjectRepository(FolderOrmEntity)
    private readonly repository: Repository<FolderOrmEntity>,
    @InjectRepository(FileOrmEntity)
    private readonly fileRepository: Repository<FileOrmEntity>,
  ) {}

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: FolderOrmEntity): FolderEntity {
    return new FolderEntity({
      id: orm.id,
      name: orm.name,
      parentId: orm.parentId,
      path: orm.path,
      state: orm.state as FolderState,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: FolderEntity): FolderOrmEntity {
    const orm = new FolderOrmEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.parentId = domain.parentId;
    orm.path = domain.path;
    orm.state = domain.state;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }

  async findById(id: string, options?: TransactionOptions): Promise<FolderEntity | null> {
    const repo = options?.queryRunner
      ? options.queryRunner.manager.getRepository(FolderOrmEntity)
      : this.repository;
    const orm = await repo.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByIdForUpdate(id: string, options?: TransactionOptions): Promise<FolderEntity | null> {
    const repo = options?.queryRunner
      ? options.queryRunner.manager.getRepository(FolderOrmEntity)
      : this.repository;
    const orm = await repo
      .createQueryBuilder('folder')
      .where('folder.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findOne(options: FindFolderOptions): Promise<FolderEntity | null> {
    const where: any = {};
    if (options.parentId !== undefined) where.parentId = options.parentId;
    if (options.name) where.name = options.name;
    if (options.state) where.state = options.state;
    if (options.path) where.path = options.path;

    const orm = await this.repository.findOne({ where });
    return orm ? this.toDomain(orm) : null;
  }

  async findByParentId(parentId: string | null, state?: FolderState): Promise<FolderEntity[]> {
    const where: any = { parentId };
    if (state) where.state = state;

    const orms = await this.repository.find({ where });
    return orms.map((orm) => this.toDomain(orm));
  }

  async existsByNameInParent(
    parentId: string | null,
    name: string,
    excludeFolderId?: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('folder')
      .where('folder.name = :name', { name })
      .andWhere('folder.state = :state', { state: FolderState.ACTIVE });

    if (parentId === null) {
      qb.andWhere('folder.parentId IS NULL');
    } else {
      qb.andWhere('folder.parentId = :parentId', { parentId });
    }

    if (excludeFolderId) {
      qb.andWhere('folder.id != :excludeFolderId', { excludeFolderId });
    }

    const count = await qb.getCount();
    return count > 0;
  }

  async findAllDescendants(folderId: string, state?: FolderState): Promise<FolderEntity[]> {
    // path 기반으로 하위 폴더 조회
    const folder = await this.findById(folderId);
    if (!folder) return [];

    const qb = this.repository
      .createQueryBuilder('folder')
      .where('folder.path LIKE :pathPattern', { pathPattern: `${folder.path}/%` });

    if (state) {
      qb.andWhere('folder.state = :state', { state });
    }

    const orms = await qb.getMany();
    return orms.map((orm) => this.toDomain(orm));
  }

  async findAncestors(folderId: string): Promise<FolderEntity[]> {
    const ancestors: FolderEntity[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.findById(currentId);
      if (!folder) break;
      ancestors.push(folder);
      currentId = folder.parentId;
    }

    return ancestors.reverse(); // 루트부터 현재 폴더 순서로
  }

  async save(folder: FolderEntity, options?: TransactionOptions): Promise<FolderEntity> {
    const repo = options?.queryRunner
      ? options.queryRunner.manager.getRepository(FolderOrmEntity)
      : this.repository;
    const orm = this.toOrm(folder);
    const saved = await repo.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async updateStateByIds(ids: string[], state: FolderState): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(FolderOrmEntity)
      .set({ state, updatedAt: new Date() })
      .where('id IN (:...ids)', { ids })
      .execute();
    return result.affected || 0;
  }

  async updatePathByPrefix(oldPrefix: string, newPrefix: string, options?: TransactionOptions): Promise<number> {
    const queryBuilder = options?.queryRunner
      ? options.queryRunner.manager.createQueryBuilder()
      : this.repository.createQueryBuilder();

    const result = await queryBuilder
      .update(FolderOrmEntity)
      .set({
        path: () => `REPLACE(path, '${oldPrefix}', '${newPrefix}')`,
        updatedAt: new Date(),
      })
      .where('path LIKE :pathPattern', { pathPattern: `${oldPrefix}%` })
      .execute();
    return result.affected || 0;
  }

  async getStatistics(folderId: string): Promise<{
    fileCount: number;
    folderCount: number;
    totalSize: number;
  }> {
    const folder = await this.findById(folderId);
    if (!folder) {
      return { fileCount: 0, folderCount: 0, totalSize: 0 };
    }

    // 직계 파일 수
    const fileCount = await this.fileRepository.count({
      where: { folderId, state: 'ACTIVE' },
    });

    // 직계 폴더 수
    const folderCount = await this.repository.count({
      where: { parentId: folderId, state: FolderState.ACTIVE },
    });

    // 전체 하위 파일 크기 (재귀)
    const descendants = await this.findAllDescendants(folderId, FolderState.ACTIVE);
    const folderIds = [folderId, ...descendants.map((d) => d.id)];

    const sizeResult = await this.fileRepository
      .createQueryBuilder('file')
      .select('SUM(file.sizeBytes)', 'totalSize')
      .where('file.folderId IN (:...folderIds)', { folderIds })
      .andWhere('file.state = :state', { state: 'ACTIVE' })
      .getRawOne();

    return {
      fileCount,
      folderCount,
      totalSize: Number(sizeResult?.totalSize || 0),
    };
  }
}
