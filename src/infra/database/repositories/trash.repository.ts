/**
 * Trash Repository 구현체
 * TypeORM을 사용한 휴지통 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { TrashMetadataOrmEntity } from '../entities/trash-metadata.orm-entity';
import { FileOrmEntity } from '../entities/file.orm-entity';
import { ITrashRepository } from '../../../domain/trash/repositories/trash.repository.interface';
import { TrashMetadataEntity } from '../../../domain/trash/entities/trash-metadata.entity';

@Injectable()
export class TrashRepository implements ITrashRepository {
  constructor(
    @InjectRepository(TrashMetadataOrmEntity)
    private readonly repository: Repository<TrashMetadataOrmEntity>,
    @InjectRepository(FileOrmEntity)
    private readonly fileRepository: Repository<FileOrmEntity>,
  ) {}

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: TrashMetadataOrmEntity): TrashMetadataEntity {
    return new TrashMetadataEntity({
      id: orm.id,
      fileId: orm.fileId ?? undefined,
      folderId: orm.folderId ?? undefined,
      originalPath: orm.originalPath,
      originalFolderId: orm.originalFolderId ?? undefined,
      originalParentId: orm.originalParentId ?? undefined,
      deletedBy: orm.deletedBy,
      deletedAt: orm.deletedAt,
      expiresAt: orm.expiresAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: TrashMetadataEntity): TrashMetadataOrmEntity {
    const orm = new TrashMetadataOrmEntity();
    orm.id = domain.id;
    orm.fileId = domain.fileId ?? null;
    orm.folderId = domain.folderId ?? null;
    orm.originalPath = domain.originalPath;
    orm.originalFolderId = domain.originalFolderId ?? null;
    orm.originalParentId = domain.originalParentId ?? null;
    orm.deletedBy = domain.deletedBy;
    orm.deletedAt = domain.deletedAt;
    orm.expiresAt = domain.expiresAt;
    return orm;
  }

  async findById(id: string): Promise<TrashMetadataEntity | null> {
    const orm = await this.repository.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFileId(fileId: string): Promise<TrashMetadataEntity | null> {
    const orm = await this.repository.findOne({ where: { fileId } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByFolderId(folderId: string): Promise<TrashMetadataEntity | null> {
    const orm = await this.repository.findOne({ where: { folderId } });
    return orm ? this.toDomain(orm) : null;
  }

  async findAll(options?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<TrashMetadataEntity[]> {
    const qb = this.repository.createQueryBuilder('trash');

    // 정렬
    const sortBy = options?.sortBy || 'deletedAt';
    const order = options?.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`trash.${sortBy}`, order as 'ASC' | 'DESC');

    // 페이지네이션
    if (options?.page && options?.limit) {
      qb.skip((options.page - 1) * options.limit);
      qb.take(options.limit);
    }

    const orms = await qb.getMany();
    return orms.map((orm) => this.toDomain(orm));
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async findExpired(limit?: number): Promise<TrashMetadataEntity[]> {
    const qb = this.repository
      .createQueryBuilder('trash')
      .where('trash.expiresAt < :now', { now: new Date() })
      .orderBy('trash.expiresAt', 'ASC');

    if (limit) {
      qb.take(limit);
    }

    const orms = await qb.getMany();
    return orms.map((orm) => this.toDomain(orm));
  }

  async save(trashMetadata: TrashMetadataEntity): Promise<TrashMetadataEntity> {
    const orm = this.toOrm(trashMetadata);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async deleteByFileId(fileId: string): Promise<void> {
    await this.repository.delete({ fileId });
  }

  async deleteByFolderId(folderId: string): Promise<void> {
    await this.repository.delete({ folderId });
  }

  async deleteAll(): Promise<number> {
    const result = await this.repository.delete({});
    return result.affected || 0;
  }

  async getTotalSize(): Promise<number> {
    // 휴지통에 있는 파일들의 총 크기
    const result = await this.repository
      .createQueryBuilder('trash')
      .leftJoin(FileOrmEntity, 'file', 'file.id = trash.fileId')
      .select('SUM(file.sizeBytes)', 'totalSize')
      .where('trash.fileId IS NOT NULL')
      .getRawOne();

    return Number(result?.totalSize || 0);
  }
}
