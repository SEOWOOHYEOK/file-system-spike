import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FileActionRequestOrmEntity } from '../entities/file-action-request.orm-entity';
import {
  IFileActionRequestRepository,
  FileActionRequestFilter,
} from '../../../domain/file-action-request/repositories/file-action-request.repository.interface';
import {
  type PaginationParams,
  type PaginatedResult,
  createPaginatedResult,
} from '../../../common/types/pagination';
import { FileActionRequest } from '../../../domain/file-action-request/entities/file-action-request.entity';
import { FileActionRequestMapper } from '../mapper/file-action-request.mapper';
import { FileActionRequestStatus } from '../../../domain/file-action-request/enums/file-action-request-status.enum';

@Injectable()
export class FileActionRequestRepository implements IFileActionRequestRepository {
  constructor(
    @InjectRepository(FileActionRequestOrmEntity)
    private readonly repo: Repository<FileActionRequestOrmEntity>,
  ) {}

  async save(request: FileActionRequest): Promise<FileActionRequest> {
    const orm = FileActionRequestMapper.toOrm(request);
    const saved = await this.repo.save(orm);
    return FileActionRequestMapper.toDomain(saved);
  }

  async findById(id: string): Promise<FileActionRequest | null> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? FileActionRequestMapper.toDomain(found) : null;
  }

  async findByFilter(
    filter: FileActionRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FileActionRequest>> {
    const { page, pageSize, sortBy = 'requestedAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;
    const qb = this.repo.createQueryBuilder('far');

    if (filter.status) qb.andWhere('far.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('far.type = :type', { type: filter.type });
    if (filter.requesterId) qb.andWhere('far.requester_id = :requesterId', { requesterId: filter.requesterId });
    if (filter.fileId) qb.andWhere('far.file_id = :fileId', { fileId: filter.fileId });
    if (filter.designatedApproverId) qb.andWhere('far.designated_approver_id = :approverId', { approverId: filter.designatedApproverId });
    if (filter.requestedAtFrom) qb.andWhere('far.requested_at >= :from', { from: filter.requestedAtFrom });
    if (filter.requestedAtTo) qb.andWhere('far.requested_at <= :to', { to: filter.requestedAtTo });

    const col = this.mapSortColumn(sortBy);
    qb.orderBy(`far.${col}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    qb.skip(skip).take(pageSize);

    const [entities, totalItems] = await qb.getManyAndCount();
    return createPaginatedResult(entities.map(FileActionRequestMapper.toDomain), page, pageSize, totalItems);
  }

  async findByIds(ids: string[]): Promise<FileActionRequest[]> {
    if (ids.length === 0) return [];
    const found = await this.repo.find({ where: { id: In(ids) } });
    return found.map(FileActionRequestMapper.toDomain);
  }

  async countByStatus(): Promise<Record<FileActionRequestStatus, number>> {
    const results = await this.repo
      .createQueryBuilder('far')
      .select('far.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('far.status')
      .getRawMany();

    const counts = Object.values(FileActionRequestStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<FileActionRequestStatus, number>,
    );
    results.forEach((r) => {
      if (r.status in counts) counts[r.status as FileActionRequestStatus] = parseInt(r.count, 10);
    });
    return counts;
  }

  async findPendingByFileId(fileId: string): Promise<FileActionRequest | null> {
    const found = await this.repo.findOne({
      where: { fileId, status: FileActionRequestStatus.PENDING },
    });
    return found ? FileActionRequestMapper.toDomain(found) : null;
  }

  private mapSortColumn(sortBy: string): string {
    const map: Record<string, string> = {
      requestedAt: 'requested_at',
      updatedAt: 'updated_at',
      decidedAt: 'decided_at',
      executedAt: 'executed_at',
      status: 'status',
      type: 'type',
    };
    return map[sortBy] || 'requested_at';
  }
}
