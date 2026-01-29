/**
 * UploadPart Repository 구현체
 * TypeORM을 사용한 업로드 파트 리포지토리
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadPartOrmEntity } from '../entities/upload-part.orm-entity';
import {
  IUploadPartRepository,
  TransactionOptions,
} from '../../../domain/upload-session/repositories/upload-session.repository.interface';
import { UploadPartEntity } from '../../../domain/upload-session/entities/upload-part.entity';
import { UploadPartStatus } from '../../../domain/upload-session/type/upload-session.type';

@Injectable()
export class UploadPartRepository implements IUploadPartRepository {
  constructor(
    @InjectRepository(UploadPartOrmEntity)
    private readonly repository: Repository<UploadPartOrmEntity>,
  ) {}

  /**
   * 트랜잭션이 있으면 해당 매니저의 리포지토리를, 없으면 기본 리포지토리 반환
   */
  private getRepository(options?: TransactionOptions): Repository<UploadPartOrmEntity> {
    return options?.queryRunner
      ? options.queryRunner.manager.getRepository(UploadPartOrmEntity)
      : this.repository;
  }

  /**
   * ORM Entity -> Domain Entity 변환
   */
  private toDomain(orm: UploadPartOrmEntity): UploadPartEntity {
    return new UploadPartEntity({
      id: orm.id,
      sessionId: orm.sessionId,
      partNumber: orm.partNumber,
      size: Number(orm.size),
      etag: orm.etag ?? undefined,
      status: orm.status as UploadPartStatus,
      objectKey: orm.objectKey ?? undefined,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  /**
   * Domain Entity -> ORM Entity 변환
   */
  private toOrm(domain: UploadPartEntity): UploadPartOrmEntity {
    const orm = new UploadPartOrmEntity();
    orm.id = domain.id;
    orm.sessionId = domain.sessionId;
    orm.partNumber = domain.partNumber;
    orm.size = domain.size;
    orm.etag = domain.etag ?? null;
    orm.status = domain.status;
    orm.objectKey = domain.objectKey ?? null;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }

  async findById(id: string, options?: TransactionOptions): Promise<UploadPartEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findBySessionIdAndPartNumber(
    sessionId: string,
    partNumber: number,
    options?: TransactionOptions,
  ): Promise<UploadPartEntity | null> {
    const repo = this.getRepository(options);
    const orm = await repo.findOne({ where: { sessionId, partNumber } });
    return orm ? this.toDomain(orm) : null;
  }

  async findBySessionId(sessionId: string, options?: TransactionOptions): Promise<UploadPartEntity[]> {
    const repo = this.getRepository(options);
    const orms = await repo.find({
      where: { sessionId },
      order: { partNumber: 'ASC' },
    });
    return orms.map((orm) => this.toDomain(orm));
  }

  async findCompletedBySessionId(sessionId: string, options?: TransactionOptions): Promise<UploadPartEntity[]> {
    const repo = this.getRepository(options);
    const orms = await repo.find({
      where: { sessionId, status: 'COMPLETED' },
      order: { partNumber: 'ASC' },
    });
    return orms.map((orm) => this.toDomain(orm));
  }

  async save(part: UploadPartEntity, options?: TransactionOptions): Promise<UploadPartEntity> {
    const repo = this.getRepository(options);
    const orm = this.toOrm(part);
    const saved = await repo.save(orm);
    return this.toDomain(saved);
  }

  async delete(id: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete(id);
  }

  async deleteBySessionId(sessionId: string, options?: TransactionOptions): Promise<void> {
    const repo = this.getRepository(options);
    await repo.delete({ sessionId });
  }
}
