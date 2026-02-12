import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ShareRequestOrmEntity } from '../entities/share-request.orm-entity';
import {
  IShareRequestRepository,
  ShareRequestFilter,
} from '../../../domain/share-request/repositories/share-request.repository.interface';
import {
  type PaginationParams,
  type PaginatedResult,
  createPaginatedResult,
} from '../../../common/types/pagination';
import { ShareRequest } from '../../../domain/share-request/entities/share-request.entity';
import { ShareRequestMapper } from '../mapper/share-request.mapper';
import { ShareRequestStatus } from '../../../domain/share-request/type/share-request-status.enum';

/**
 * ShareRequest Repository 구현체
 *
 * TypeORM을 사용한 ShareRequest 영속성 관리
 */
@Injectable()
export class ShareRequestRepository implements IShareRequestRepository {
  constructor(
    @InjectRepository(ShareRequestOrmEntity)
    private readonly shareRequestRepository: Repository<ShareRequestOrmEntity>,
  ) {}

  async save(shareRequest: ShareRequest): Promise<ShareRequest> {
    const ormEntity = ShareRequestMapper.toOrm(shareRequest);
    const saved = await this.shareRequestRepository.save(ormEntity);
    return ShareRequestMapper.toDomain(saved);
  }

  async findById(id: string): Promise<ShareRequest | null> {
    const found = await this.shareRequestRepository.findOne({ where: { id } });
    return found ? ShareRequestMapper.toDomain(found) : null;
  }

  async findByFilter(
    filter: ShareRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareRequest>> {
    const { page, pageSize, sortBy = 'requestedAt', sortOrder = 'desc' } =
      pagination;
    const skip = (page - 1) * pageSize;

    const queryBuilder = this.shareRequestRepository.createQueryBuilder('sr');

    // 상태 필터
    if (filter.status) {
      queryBuilder.andWhere('sr.status = :status', { status: filter.status });
    }

    // 요청자 ID 필터
    if (filter.requesterId) {
      queryBuilder.andWhere('sr.requester_id = :requesterId', {
        requesterId: filter.requesterId,
      });
    }

    // 요청자 ID 제외 필터 (본인이 요청한 건 제외)
    if (filter.excludeRequesterId) {
      queryBuilder.andWhere('sr.requester_id != :excludeRequesterId', {
        excludeRequesterId: filter.excludeRequesterId,
      });
    }

    // 파일 ID 필터 (UUID 배열에 포함되는지 확인)
    if (filter.fileId) {
      queryBuilder.andWhere('sr.file_ids @> ARRAY[:fileId]::uuid[]', {
        fileId: filter.fileId,
      });
    }

    // 대상 사용자 ID 필터 (JSONB targets 배열에서 userId 찾기)
    if (filter.targetUserId) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(sr.targets) AS target
          WHERE target->>'userId' = :targetUserId
        )`,
        { targetUserId: filter.targetUserId },
      );
    }

    // 승인자 ID 필터 (실제 승인/반려 처리자)
    if (filter.approverId) {
      queryBuilder.andWhere('sr.approver_id = :approverId', {
        approverId: filter.approverId,
      });
    }

    // 지정 승인자 ID 필터 (승인 담당자)
    if (filter.designatedApproverId) {
      queryBuilder.andWhere('sr.designated_approver_id = :designatedApproverId', {
        designatedApproverId: filter.designatedApproverId,
      });
    }

    // 요청일 시작 필터
    if (filter.requestedAtFrom) {
      queryBuilder.andWhere('sr.requested_at >= :requestedAtFrom', {
        requestedAtFrom: filter.requestedAtFrom,
      });
    }

    // 요청일 종료 필터
    if (filter.requestedAtTo) {
      queryBuilder.andWhere('sr.requested_at <= :requestedAtTo', {
        requestedAtTo: filter.requestedAtTo,
      });
    }

    // 정렬
    const sortColumn = this.mapSortByToColumn(sortBy);
    queryBuilder.orderBy(`sr.${sortColumn}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // 페이지네이션
    queryBuilder.skip(skip).take(pageSize);

    const [entities, totalItems] = await queryBuilder.getManyAndCount();

    return createPaginatedResult(
      entities.map(ShareRequestMapper.toDomain),
      page,
      pageSize,
      totalItems,
    );
  }

  async findByIds(ids: string[]): Promise<ShareRequest[]> {
    if (ids.length === 0) {
      return [];
    }
    const found = await this.shareRequestRepository.find({
      where: { id: In(ids) },
    });
    return found.map(ShareRequestMapper.toDomain);
  }

  async countByStatus(): Promise<Record<ShareRequestStatus, number>> {
    const results = await this.shareRequestRepository
      .createQueryBuilder('sr')
      .select('sr.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('sr.status')
      .getRawMany();

    // 모든 상태에 대해 0으로 초기화
    const counts: Record<ShareRequestStatus, number> = {
      [ShareRequestStatus.PENDING]: 0,
      [ShareRequestStatus.APPROVED]: 0,
      [ShareRequestStatus.REJECTED]: 0,
      [ShareRequestStatus.CANCELED]: 0,
    };

    // 결과를 맵에 채움
    results.forEach((row) => {
      const status = row.status as ShareRequestStatus;
      if (status in counts) {
        counts[status] = parseInt(row.count, 10);
      }
    });

    return counts;
  }

  async findPendingByFileAndTarget(
    fileId: string,
    targetUserId: string,
  ): Promise<ShareRequest | null> {
    const found = await this.shareRequestRepository
      .createQueryBuilder('sr')
      .where('sr.status = :status', { status: ShareRequestStatus.PENDING })
      .andWhere('sr.file_ids @> ARRAY[:fileId]::uuid[]', { fileId })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(sr.targets) AS target
          WHERE target->>'userId' = :targetUserId
        )`,
        { targetUserId },
      )
      .getOne();

    return found ? ShareRequestMapper.toDomain(found) : null;
  }

  /**
   * 정렬 필드명을 DB 컬럼명으로 매핑
   */
  private mapSortByToColumn(sortBy: string): string {
    const columnMap: Record<string, string> = {
      requestedAt: 'requested_at',
      updatedAt: 'updated_at',
      startAt: 'start_at',
      endAt: 'end_at',
      decidedAt: 'decided_at',
      status: 'status',
    };
    return columnMap[sortBy] || 'requested_at';
  }
}
