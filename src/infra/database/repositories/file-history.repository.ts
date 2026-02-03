import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FileHistory } from '../../../domain/audit/entities/file-history.entity';
import {
  IFileHistoryRepository,
  FileHistoryFilterOptions,
} from '../../../domain/audit/repositories/file-history.repository.interface';
import {
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/audit/repositories/audit-log.repository.interface';
import { FileHistoryOrmEntity } from '../entities/file-history.orm-entity';
import { FileHistoryMapper } from '../mapper/file-history.mapper';

/**
 * FileHistory 리포지토리 구현
 */
@Injectable()
export class FileHistoryRepository implements IFileHistoryRepository {
  constructor(
    @InjectRepository(FileHistoryOrmEntity)
    private readonly fileHistoryRepository: Repository<FileHistoryOrmEntity>,
  ) {}

  async save(history: FileHistory): Promise<FileHistory> {
    const ormEntity = FileHistoryMapper.toOrm(history);
    const saved = await this.fileHistoryRepository.save(ormEntity);
    return FileHistoryMapper.toDomain(saved as FileHistoryOrmEntity);
  }

  async saveMany(histories: FileHistory[]): Promise<void> {
    const ormEntities = histories.map((h) => FileHistoryMapper.toOrm(h));
    await this.fileHistoryRepository.save(ormEntities);
  }

  async findById(id: string): Promise<FileHistory | null> {
    const orm = await this.fileHistoryRepository.findOne({ where: { id } });
    return orm ? FileHistoryMapper.toDomain(orm) : null;
  }

  async findByFilter(
    filter: FileHistoryFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<FileHistory>> {
    const queryBuilder = this.fileHistoryRepository.createQueryBuilder('history');

    if (filter.fileId) {
      queryBuilder.andWhere('history.fileId = :fileId', {
        fileId: filter.fileId,
      });
    }
    if (filter.changeType) {
      queryBuilder.andWhere('history.changeType = :changeType', {
        changeType: filter.changeType,
      });
    }
    if (filter.changeTypes && filter.changeTypes.length > 0) {
      queryBuilder.andWhere('history.changeType IN (:...changeTypes)', {
        changeTypes: filter.changeTypes,
      });
    }
    if (filter.changedBy) {
      queryBuilder.andWhere('history.changedBy = :changedBy', {
        changedBy: filter.changedBy,
      });
    }
    if (filter.startDate) {
      queryBuilder.andWhere('history.createdAt >= :startDate', {
        startDate: filter.startDate,
      });
    }
    if (filter.endDate) {
      queryBuilder.andWhere('history.createdAt <= :endDate', {
        endDate: filter.endDate,
      });
    }

    queryBuilder
      .orderBy('history.createdAt', 'DESC')
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data: FileHistoryMapper.toDomainList(data),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async findByFileId(fileId: string, limit: number = 100): Promise<FileHistory[]> {
    const orms = await this.fileHistoryRepository.find({
      where: { fileId },
      order: { version: 'DESC' },
      take: limit,
    });
    return FileHistoryMapper.toDomainList(orms);
  }

  async findByFileIdAndVersion(
    fileId: string,
    version: number,
  ): Promise<FileHistory | null> {
    const orm = await this.fileHistoryRepository.findOne({
      where: { fileId, version },
    });
    return orm ? FileHistoryMapper.toDomain(orm) : null;
  }

  async getLatestVersion(fileId: string): Promise<number> {
    const result = await this.fileHistoryRepository
      .createQueryBuilder('history')
      .select('MAX(history.version)', 'maxVersion')
      .where('history.fileId = :fileId', { fileId })
      .getRawOne();

    return result?.maxVersion || 0;
  }

  async findByChangedBy(
    changedBy: string,
    limit: number = 100,
  ): Promise<FileHistory[]> {
    const orms = await this.fileHistoryRepository.find({
      where: { changedBy },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return FileHistoryMapper.toDomainList(orms);
  }
}
