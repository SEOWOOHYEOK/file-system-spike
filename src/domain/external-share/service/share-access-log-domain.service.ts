import { Inject, Injectable } from '@nestjs/common';
import { SHARE_ACCESS_LOG_REPOSITORY } from '../repositories/share-access-log.repository.interface';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';
import type {
  AccessLogFilter,
  IShareAccessLogRepository,
} from '../repositories/share-access-log.repository.interface';
import type { ShareAccessLog } from '../entities/share-access-log.entity';

@Injectable()
export class ShareAccessLogDomainService {
  constructor(
    @Inject(SHARE_ACCESS_LOG_REPOSITORY)
    private readonly repository: IShareAccessLogRepository,
  ) {}

  async 저장(log: ShareAccessLog): Promise<ShareAccessLog> {
    return this.repository.save(log);
  }

  async 조회(id: string): Promise<ShareAccessLog | null> {
    return this.repository.findById(id);
  }

  async 공유별조회(
    publicShareId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareAccessLog>> {
    return this.repository.findByShareId(publicShareId, pagination);
  }

  async 외부사용자별조회(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareAccessLog>> {
    return this.repository.findByExternalUserId(externalUserId, pagination);
  }

  async 전체조회(
    pagination: PaginationParams,
    filter?: AccessLogFilter,
  ): Promise<PaginatedResult<ShareAccessLog>> {
    return this.repository.findAll(pagination, filter);
  }
}
