/**
 * UploadSession Repository 구현체
 * TypeORM을 사용한 업로드 세션 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { UploadSessionOrmEntity } from '../entities/upload-session.orm-entity';
import {
  IUploadSessionRepository,
  FindSessionOptions,
  TransactionOptions,
} from '../../../domain/upload-session/repositories/upload-session.repository.interface';
import { UploadSessionEntity } from '../../../domain/upload-session/entities/upload-session.entity';
import { UploadSessionStatus } from '../../../domain/upload-session/type/upload-session.type';

@Injectable()
export class UploadSessionRepository implements IUploadSessionRepository {
  constructor(
    @InjectRepository(UploadSessionOrmEntity)
    private readonly repository: Repository<UploadSessionOrmEntity>,
  ) {}

  /**
   * 트랜잭션이 있으면 해당 매니저의 리포지토리를, 없으면 기본 리포지토리 반환
   */
  private getRepository(options?: TransactionOptions): Repository<UploadSessionOrmEntity> {
    return options?.queryRunner
      ? options.queryRunner.manager.getRepository(UploadSessionOrmEntity)
      : this.repository;
  }

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: UploadSessionOrmEntity): UploadSessionEntity {
    return new UploadSessionEntity({
      id: orm.id,
      fileName: orm.fileName,
      folderId: orm.folderId,
      totalSize: Number(orm.totalSize),
      partSize: orm.partSize,
      totalParts: orm.totalParts,
      mimeType: orm.mimeType,
      status: orm.status as UploadSessionStatus,
      uploadedBytes: Number(orm.uploadedBytes),
      completedParts: orm.completedParts ?? [],
      expiresAt: orm.expiresAt,
      fileId: orm.fileId ?? undefined,
      uploadId: orm.uploadId ?? undefined,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: UploadSessionEntity): UploadSessionOrmEntity {
    const orm = new UploadSessionOrmEntity();
    orm.id = domain.id;
    orm.fileName = domain.fileName;
    orm.folderId = domain.folderId;
    orm.totalSize = domain.totalSize;
    orm.partSize = domain.partSize;
    orm.totalParts = domain.totalParts;
    orm.mimeType = domain.mimeType;
    orm.status = domain.status;
    orm.uploadedBytes = domain.uploadedBytes;
    orm.completedParts = domain.completedParts;
    orm.expiresAt = domain.expiresAt;
    orm.fileId = domain.fileId ?? null;
    orm.uploadId = domain.uploadId ?? null;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }

  async findById(id: string, options?: TransactionOptions): Promise<UploadSessionEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByIdForUpdate(id: string, options?: TransactionOptions): Promise<UploadSessionEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo
      .createQueryBuilder('session')
      .where('session.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    return orm ? this.toDomain(orm) : null;
  }

  async findMany(findOptions: FindSessionOptions, options?: TransactionOptions): Promise<UploadSessionEntity[]> {
    const repo = this.getRepository(options);

    // QueryBuilder를 사용하여 복잡한 조건 처리
    const qb = repo.createQueryBuilder('session');

    if (findOptions.folderId) {
      qb.andWhere('session.folderId = :folderId', { folderId: findOptions.folderId });
    }

    if (findOptions.status) {
      if (Array.isArray(findOptions.status)) {
        qb.andWhere('session.status IN (:...statuses)', { statuses: findOptions.status });
      } else {
        qb.andWhere('session.status = :status', { status: findOptions.status });
      }
    }

    if (findOptions.fileId) {
      qb.andWhere('session.fileId = :fileId', { fileId: findOptions.fileId });
    }

    if (findOptions.updatedBefore) {
      qb.andWhere('session.updatedAt < :updatedBefore', { updatedBefore: findOptions.updatedBefore });
    }

    qb.orderBy('session.createdAt', 'DESC');

    if (findOptions.limit) {
      qb.take(findOptions.limit);
    }

    const orms = await qb.getMany();
    return orms.map((orm) => this.toDomain(orm));
  }

  async findExpiredSessions(limit = 100, options?: TransactionOptions): Promise<UploadSessionEntity[]> {
    const repo = this.getRepository(options);
    const orms = await repo.find({
      where: {
        expiresAt: LessThan(new Date()),
        status: 'INIT',
      },
      take: limit,
    });
    
    const uploading = await repo.find({
      where: {
        expiresAt: LessThan(new Date()),
        status: 'UPLOADING',
      },
      take: limit,
    });

    return [...orms, ...uploading].map((orm) => this.toDomain(orm));
  }

  async save(session: UploadSessionEntity, options?: TransactionOptions): Promise<UploadSessionEntity> {
    const repo = this.getRepository(options);
    const orm = this.toOrm(session);
    const saved = await repo.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete(id);
  }

  async deleteExpiredSessions(options?: TransactionOptions): Promise<number> {
    const repo = this.getRepository(options);
    const result = await repo.delete({
      expiresAt: LessThan(new Date()),
      status: 'EXPIRED',
    });
    return result.affected ?? 0;
  }

  async getActiveSessionStats(options?: TransactionOptions): Promise<{ count: number; totalBytes: number }> {
    const repo = this.getRepository(options);
    const now = new Date();

    const result = await repo
      .createQueryBuilder('session')
      .select('COUNT(session.id)', 'count')
      .addSelect('COALESCE(SUM(session.totalSize), 0)', 'totalBytes')
      .where('session.status IN (:...statuses)', {
        statuses: [UploadSessionStatus.INIT, UploadSessionStatus.UPLOADING],
      })
      .andWhere('session.expiresAt > :now', { now })
      .getRawOne();

    return {
      count: parseInt(result?.count ?? '0', 10),
      totalBytes: parseInt(result?.totalBytes ?? '0', 10),
    };
  }
}
