import { Inject, Injectable } from '@nestjs/common';
import { ShareRequest } from '../entities/share-request.entity';
import { ShareRequestStatus } from '../type/share-request-status.enum';
import {
  SHARE_REQUEST_REPOSITORY,
  type IShareRequestRepository,
  type ShareRequestFilter,
} from '../repositories/share-request.repository.interface';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';

/**
 * ShareRequest 도메인 서비스
 *
 * ShareRequest 도메인 엔티티의 영속성 관리를 담당합니다.
 */
@Injectable()
export class ShareRequestDomainService {
  constructor(
    @Inject(SHARE_REQUEST_REPOSITORY)
    private readonly repository: IShareRequestRepository,
  ) {}

  /**
   * ShareRequest 저장
   */
  async 저장(shareRequest: ShareRequest): Promise<ShareRequest> {
    return this.repository.save(shareRequest);
  }

  /**
   * ID로 ShareRequest 조회
   */
  async 조회(id: string): Promise<ShareRequest | null> {
    return this.repository.findById(id);
  }

  /**
   * 필터 조건으로 ShareRequest 목록 조회
   */
  async 필터조회(
    filter: ShareRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareRequest>> {
    return this.repository.findByFilter(filter, pagination);
  }

  /**
   * 여러 ID로 ShareRequest 일괄 조회
   */
  async 다건조회(ids: string[]): Promise<ShareRequest[]> {
    return this.repository.findByIds(ids);
  }

  /**
   * 상태별 ShareRequest 개수 조회
   */
  async 상태별카운트(): Promise<Record<ShareRequestStatus, number>> {
    return this.repository.countByStatus();
  }

  /**
   * 파일과 대상 사용자로 대기 중인 요청 조회
   */
  async 대기중요청조회(
    fileId: string,
    targetUserId: string,
  ): Promise<ShareRequest | null> {
    return this.repository.findPendingByFileAndTarget(fileId, targetUserId);
  }
}
