import { Inject, Injectable } from '@nestjs/common';
import { PUBLIC_SHARE_REPOSITORY } from '../repositories/public-share.repository.interface';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';
import type {
  IPublicShareRepository,
  SharedFileStats,
} from '../repositories/public-share.repository.interface';
import type { PublicShare } from '../entities/public-share.entity';

@Injectable()
export class PublicShareDomainService {
  constructor(
    @Inject(PUBLIC_SHARE_REPOSITORY)
    private readonly repository: IPublicShareRepository,
  ) {}

  async 저장(share: PublicShare): Promise<PublicShare> {
    return this.repository.save(share);
  }

  async 조회(id: string): Promise<PublicShare | null> {
    return this.repository.findById(id);
  }

  async 외부사용자별조회(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.repository.findByExternalUser(externalUserId, pagination);
  }

  async 소유자별조회(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.repository.findByOwner(ownerId, pagination);
  }

  async 파일별조회(fileId: string): Promise<PublicShare[]> {
    return this.repository.findByFileId(fileId);
  }

  async 파일외부사용자조회(
    fileId: string,
    externalUserId: string,
  ): Promise<PublicShare | null> {
    return this.repository.findByFileAndExternalUser(fileId, externalUserId);
  }

  async 전체조회(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.repository.findAll(pagination);
  }

  async 파일공유일괄차단(
    fileId: string,
    blockedBy: string,
  ): Promise<number> {
    return this.repository.blockAllByFileId(fileId, blockedBy);
  }

  async 파일공유일괄차단해제(fileId: string): Promise<number> {
    return this.repository.unblockAllByFileId(fileId);
  }

  async 외부사용자공유일괄차단(
    externalUserId: string,
    blockedBy: string,
  ): Promise<number> {
    return this.repository.blockAllByExternalUserId(externalUserId, blockedBy);
  }

  async 공유파일통계조회(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SharedFileStats>> {
    return this.repository.getSharedFilesStats(pagination);
  }

  async 삭제(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}
