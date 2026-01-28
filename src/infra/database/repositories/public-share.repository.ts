import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicShareOrmEntity } from '../entities/public-share.orm-entity';
import {
  IPublicShareRepository,
  SharedFileStats,
} from '../../../domain/external-share/repositories/public-share.repository.interface';
import {
  PaginationParams,
  PaginatedResult,
} from '../../../domain/external-share/repositories/external-user.repository.interface';
import { PublicShare } from '../../../domain/external-share/entities/public-share.entity';
import { PublicShareMapper } from '../mapper/public-share.mapper';

/**
 * PublicShare Repository 구현체
 *
 * TypeORM을 사용한 PublicShare 영속성 관리
 */
@Injectable()
export class PublicShareRepository implements IPublicShareRepository {
  constructor(
    @InjectRepository(PublicShareOrmEntity)
    private readonly repo: Repository<PublicShareOrmEntity>,
  ) {}

  async save(share: PublicShare): Promise<PublicShare> {
    const ormEntity = PublicShareMapper.toOrm(share);
    const saved = await this.repo.save(ormEntity);
    return PublicShareMapper.toDomain(saved);
  }

  async findById(id: string): Promise<PublicShare | null> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? PublicShareMapper.toDomain(found) : null;
  }

  async findByExternalUser(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const { page, pageSize, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const [entities, totalItems] = await this.repo.findAndCount({
      where: { externalUserId },
      skip,
      take: pageSize,
      order: { [sortBy]: sortOrder.toUpperCase() as 'ASC' | 'DESC' },
    });

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: entities.map(PublicShareMapper.toDomain),
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async findByOwner(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const { page, pageSize, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const [entities, totalItems] = await this.repo.findAndCount({
      where: { ownerId },
      skip,
      take: pageSize,
      order: { [sortBy]: sortOrder.toUpperCase() as 'ASC' | 'DESC' },
    });

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: entities.map(PublicShareMapper.toDomain),
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async findByFileId(fileId: string): Promise<PublicShare[]> {
    const found = await this.repo.find({ where: { fileId } });
    return found.map(PublicShareMapper.toDomain);
  }

  async findByFileAndExternalUser(
    fileId: string,
    externalUserId: string,
  ): Promise<PublicShare | null> {
    const found = await this.repo.findOne({
      where: { fileId, externalUserId },
    });
    return found ? PublicShareMapper.toDomain(found) : null;
  }

  async findAll(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const { page, pageSize, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const [entities, totalItems] = await this.repo.findAndCount({
      skip,
      take: pageSize,
      order: { [sortBy]: sortOrder.toUpperCase() as 'ASC' | 'DESC' },
    });

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: entities.map(PublicShareMapper.toDomain),
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async blockAllByFileId(fileId: string, blockedBy: string): Promise<number> {
    const result = await this.repo.update(
      { fileId, isBlocked: false },
      {
        isBlocked: true,
        blockedBy,
        blockedAt: new Date(),
      },
    );
    return result.affected || 0;
  }

  async unblockAllByFileId(fileId: string): Promise<number> {
    const result = await this.repo.update(
      { fileId, isBlocked: true },
      {
        isBlocked: false,
        blockedBy: null,
        blockedAt: null,
      },
    );
    return result.affected || 0;
  }

  async blockAllByExternalUserId(
    externalUserId: string,
    blockedBy: string,
  ): Promise<number> {
    const result = await this.repo.update(
      { externalUserId, isBlocked: false },
      {
        isBlocked: true,
        blockedBy,
        blockedAt: new Date(),
      },
    );
    return result.affected || 0;
  }

  async getSharedFilesStats(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SharedFileStats>> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    // 공유된 파일 통계 쿼리
    const query = this.repo
      .createQueryBuilder('share')
      .select('share.file_id', 'fileId')
      .addSelect('COUNT(*)', 'shareCount')
      .addSelect(
        "COUNT(*) FILTER (WHERE share.is_blocked = false AND share.is_revoked = false)",
        'activeShareCount',
      )
      .addSelect('SUM(share.current_view_count)', 'totalViewCount')
      .addSelect('SUM(share.current_download_count)', 'totalDownloadCount')
      .addSelect('MIN(share.created_at)', 'firstSharedAt')
      .addSelect('MAX(share.created_at)', 'lastSharedAt')
      .groupBy('share.file_id');

    const countQuery = this.repo
      .createQueryBuilder('share')
      .select('COUNT(DISTINCT share.file_id)', 'count');

    const [statsRaw, countResult] = await Promise.all([
      query.offset(skip).limit(pageSize).getRawMany(),
      countQuery.getRawOne(),
    ]);

    const totalItems = parseInt(countResult?.count || '0', 10);
    const totalPages = Math.ceil(totalItems / pageSize);

    // TODO: 파일 정보(fileName, mimeType)는 File 테이블 조인 필요
    const items: SharedFileStats[] = statsRaw.map((row) => ({
      fileId: row.fileId,
      fileName: '', // File 테이블 조인 필요
      mimeType: '', // File 테이블 조인 필요
      shareCount: parseInt(row.shareCount, 10),
      activeShareCount: parseInt(row.activeShareCount || '0', 10),
      totalViewCount: parseInt(row.totalViewCount || '0', 10),
      totalDownloadCount: parseInt(row.totalDownloadCount || '0', 10),
      firstSharedAt: new Date(row.firstSharedAt),
      lastSharedAt: new Date(row.lastSharedAt),
    }));

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
