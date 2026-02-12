import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ShareRequestDomainService } from '../../domain/share-request/service/share-request-domain.service';
import { ShareRequest } from '../../domain/share-request/entities/share-request.entity';
import { ShareRequestStatus } from '../../domain/share-request/type/share-request-status.enum';
import { ShareRequestFilter } from '../../domain/share-request/repositories/share-request.repository.interface';
import { PaginationParams, PaginatedResult } from '../../common/types/pagination';
import { PublicShareDomainService } from '../../domain/external-share';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import { FileDomainService } from '../../domain/file';
import { ExternalUserDomainService } from '../../domain/external-share';
import { DomainEmployeeService } from '../../integrations/migration/organization/services/employee.service';
import {
  InternalUserDetail,
  ExternalUserDetail,
  UserDetail,
  ShareItemResult,
  SharesByTargetResult,
  SharesByFileResult,
  FileDetail,
  EnrichedShareTarget,
  EnrichedShareRequest,
  ShareRequestBrief,
  GroupSummary,
  FileGroupItem,
  TargetGroupItem,
  FileGroupListResult,
  TargetGroupListResult,
} from './types/share-request-query.types';

/**
 * ShareRequest 조회 서비스
 *
 * 파일 공유 요청의 모든 조회 작업을 담당합니다.
 */
@Injectable()
export class ShareRequestQueryService {
  constructor(
    private readonly shareRequestDomainService: ShareRequestDomainService,
    private readonly publicShareDomainService: PublicShareDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly externalUserDomainService: ExternalUserDomainService,
    private readonly employeeService: DomainEmployeeService,
  ) {}

  /**
   * 상태별 요약 조회 (A-1 API)
   *
   * @returns 상태별 ShareRequest 개수
   */
  async getSummary(): Promise<Record<ShareRequestStatus, number>> {
    return this.shareRequestDomainService.상태별카운트();
  }

  /**
   * 요청 목록 조회 (A-2 API, R-2 API)
   *
   * @param filter 필터 조건
   * @param pagination 페이지네이션 파라미터
   * @returns 페이지네이션된 ShareRequest 목록
   */
  async getShareRequests(
    filter: ShareRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ShareRequest>> {
    return this.shareRequestDomainService.필터조회(filter, pagination);
  }

  /**
   * 요청 상세 조회 (A-3 API)
   *
   * @param requestId 요청 ID
   * @returns ShareRequest 상세 정보
   * @throws NotFoundException 요청을 찾을 수 없는 경우
   */
  async getShareRequestDetail(requestId: string): Promise<ShareRequest> {
    const shareRequest = await this.shareRequestDomainService.조회(requestId);
    if (!shareRequest) {
      throw new NotFoundException(`공유 요청을 찾을 수 없습니다: ${requestId}`);
    }
    return shareRequest;
  }

  /**
   * 내 요청 상세 조회 (R-3 API)
   *
   * @param requestId 요청 ID
   * @param requesterId 요청자 ID
   * @returns ShareRequest 상세 정보
   * @throws NotFoundException 요청을 찾을 수 없는 경우
   * @throws ForbiddenException 요청자가 아닌 경우
   */
  async getMyShareRequestDetail(
    requestId: string,
    requesterId: string,
  ): Promise<ShareRequest> {
    const shareRequest = await this.shareRequestDomainService.조회(requestId);
    if (!shareRequest) {
      throw new NotFoundException(`공유 요청을 찾을 수 없습니다: ${requestId}`);
    }

    if (shareRequest.requesterId !== requesterId) {
      throw new ForbiddenException('본인이 요청한 공유만 조회할 수 있습니다.');
    }

    return shareRequest;
  }

  /**
   * 대상자별 조회 (Q-1 API)
   *
   * 특정 사용자에게 공유된 파일 목록을 조회합니다.
   * 활성 PublicShare와 대기 중인 ShareRequest를 모두 포함합니다.
   *
   * @param targetUserId 대상 사용자 ID
   * @param pagination 페이지네이션 파라미터
   * @returns 공유 항목 목록 및 요약 정보
   */
  async getSharesByTarget(
    targetUserId: string,
    pagination: PaginationParams,
  ): Promise<SharesByTargetResult> {
    // 1. 대상 사용자 정보 조회 (내부 또는 외부)
    const target = await this.getUserDetail(targetUserId);
    if (!target) {
      throw new NotFoundException(`사용자를 찾을 수 없습니다: ${targetUserId}`);
    }

    // 2. ShareRequest 조회 (대상 사용자가 포함된 요청)
    const shareRequestFilter: ShareRequestFilter = {
      targetUserId,
      status: ShareRequestStatus.PENDING,
    };
    const pendingRequests = await this.shareRequestDomainService.필터조회(
      shareRequestFilter,
      { page: 1, pageSize: 1000 }, // 모든 대기 중 요청 조회
    );

    // 3. PublicShare 조회 (활성 공유)
    // 내부 사용자인 경우 internalUserId로, 외부 사용자인 경우 externalUserId로 조회
    let activeShares: PublicShare[] = [];
    if (target.type === 'INTERNAL_USER') {
      // 내부 사용자의 경우, 모든 공유를 조회하여 필터링
      // TODO: Repository에 findByInternalUser 메서드 추가 시 최적화 가능
      const allSharesResult = await this.publicShareDomainService.전체조회({
        page: 1,
        pageSize: 10000, // 큰 페이지 사이즈로 모든 공유 조회
      });
      activeShares = allSharesResult.items.filter(
        (share) =>
          share.internalUserId === targetUserId && share.isValid(),
      );
    } else {
      // 외부 사용자의 경우, 외부사용자별조회 사용
      const result = await this.publicShareDomainService.외부사용자별조회(
        targetUserId,
        { page: 1, pageSize: 10000 },
      );
      activeShares = result.items.filter((share) => share.isValid());
    }

    // 4. ShareItemResult로 변환
    const items: ShareItemResult[] = [];

    // 활성 공유 추가
    for (const share of activeShares) {
      const file = await this.fileDomainService.조회(share.fileId);
      if (!file) continue;

      const requester = await this.getInternalUserDetail(share.ownerId);
      if (!requester) continue;

      items.push({
        source: 'ACTIVE_SHARE',
        file: {
          id: file.id,
          name: file.name,
          path: file.folderId, // path는 folderId로 대체
          mimeType: file.mimeType,
        },
        requester,
        target,
        permission: share.permissions[0] || 'VIEW',
        startAt: share.startAt || share.createdAt,
        endAt: share.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 기본값: 1년 후
        reason: '', // PublicShare에는 reason이 없음
        publicShareId: share.id,
        currentViewCount: share.currentViewCount,
        currentDownloadCount: share.currentDownloadCount,
        isBlocked: share.isBlocked,
        sharedAt: share.createdAt,
      });
    }

    // 대기 중 요청 추가
    for (const request of pendingRequests.items) {
      // 이 요청이 대상 사용자를 포함하는지 확인
      const hasTarget = request.targets.some(
        (target) => target.userId === targetUserId,
      );
      if (!hasTarget) continue;

      // 각 파일에 대해 항목 생성
      for (const fileId of request.fileIds) {
        const file = await this.fileDomainService.조회(fileId);
        if (!file) continue;

        const requester = await this.getInternalUserDetail(request.requesterId);
        if (!requester) continue;

        const approver = request.approverId
          ? (await this.getInternalUserDetail(request.approverId)) ?? undefined
          : undefined;

        items.push({
          source: 'PENDING_REQUEST',
          file: {
            id: file.id,
            name: file.name,
            path: file.folderId,
            mimeType: file.mimeType,
          },
          requester,
          target,
          approver,
          isAutoApproved: request.isAutoApproved,
          decidedAt: request.decidedAt,
          decisionComment: request.decisionComment,
          reason: request.reason,
          permission: request.permission.type,
          startAt: request.startAt,
          endAt: request.endAt,
          shareRequestId: request.id,
          requestedAt: request.requestedAt,
        });
      }
    }

    // 5. 페이지네이션 적용
    const { page, pageSize } = pagination;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = items.slice(startIndex, endIndex);

    // 6. 요약 정보 계산
    const summary = {
      activeShareCount: activeShares.length,
      pendingRequestCount: pendingRequests.items.length,
      totalViewCount: activeShares.reduce(
        (sum, share) => sum + share.currentViewCount,
        0,
      ),
      totalDownloadCount: activeShares.reduce(
        (sum, share) => sum + share.currentDownloadCount,
        0,
      ),
    };

    return {
      items: paginatedItems,
      summary,
      target,
    };
  }

  /**
   * 파일별 조회 (Q-2 API)
   *
   * 특정 파일에 대한 공유 목록을 조회합니다.
   * 활성 PublicShare와 대기 중인 ShareRequest를 모두 포함합니다.
   *
   * @param fileId 파일 ID
   * @param pagination 페이지네이션 파라미터
   * @returns 공유 항목 목록 및 요약 정보
   */
  async getSharesByFile(
    fileId: string,
    pagination: PaginationParams,
  ): Promise<SharesByFileResult> {
    // 1. 파일 정보 조회
    const file = await this.fileDomainService.조회(fileId);
    if (!file) {
      throw new NotFoundException(`파일을 찾을 수 없습니다: ${fileId}`);
    }

    // 2. ShareRequest 조회 (이 파일이 포함된 요청)
    const shareRequestFilter: ShareRequestFilter = {
      fileId,
      status: ShareRequestStatus.PENDING,
    };
    const pendingRequests = await this.shareRequestDomainService.필터조회(
      shareRequestFilter,
      { page: 1, pageSize: 1000 },
    );

    // 3. PublicShare 조회 (이 파일의 활성 공유)
    const allShares = await this.publicShareDomainService.파일별조회(fileId);
    const activeShares = allShares.filter((share) => share.isValid());

    // 4. ShareItemResult로 변환
    const items: ShareItemResult[] = [];

    // 활성 공유 추가
    for (const share of activeShares) {
      const requester = await this.getInternalUserDetail(share.ownerId);
      if (!requester) continue;

      // 대상 사용자 조회
      let target: UserDetail | null = null;
      if (share.internalUserId) {
        target = await this.getInternalUserDetail(share.internalUserId);
      } else if (share.externalUserId) {
        target = await this.getExternalUserDetail(share.externalUserId);
      }
      if (!target) continue;

      items.push({
        source: 'ACTIVE_SHARE',
        file: {
          id: file.id,
          name: file.name,
          path: file.folderId,
          mimeType: file.mimeType,
        },
        requester,
        target,
        permission: share.permissions[0] || 'VIEW',
        startAt: share.startAt || share.createdAt,
        endAt: share.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        reason: '',
        publicShareId: share.id,
        currentViewCount: share.currentViewCount,
        currentDownloadCount: share.currentDownloadCount,
        isBlocked: share.isBlocked,
        sharedAt: share.createdAt,
      });
    }

    // 대기 중 요청 추가
    for (const request of pendingRequests.items) {
      // 이 요청이 이 파일을 포함하는지 확인
      if (!request.fileIds.includes(fileId)) continue;

      const requester = await this.getInternalUserDetail(request.requesterId);
      if (!requester) continue;

      const approver = request.approverId
        ? (await this.getInternalUserDetail(request.approverId)) ?? undefined
        : undefined;

      // 각 대상에 대해 항목 생성
      for (const targetShare of request.targets) {
        const target = await this.getUserDetail(targetShare.userId);
        if (!target) continue;

        items.push({
          source: 'PENDING_REQUEST',
          file: {
            id: file.id,
            name: file.name,
            path: file.folderId,
            mimeType: file.mimeType,
          },
          requester,
          target,
          approver,
          isAutoApproved: request.isAutoApproved,
          decidedAt: request.decidedAt,
          decisionComment: request.decisionComment,
          reason: request.reason,
          permission: request.permission.type,
          startAt: request.startAt,
          endAt: request.endAt,
          shareRequestId: request.id,
          requestedAt: request.requestedAt,
        });
      }
    }

    // 5. 페이지네이션 적용
    const { page, pageSize } = pagination;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = items.slice(startIndex, endIndex);

    // 6. 요약 정보 계산
    const summary = {
      activeShareCount: activeShares.length,
      pendingRequestCount: pendingRequests.items.length,
      totalViewCount: activeShares.reduce(
        (sum, share) => sum + share.currentViewCount,
        0,
      ),
      totalDownloadCount: activeShares.reduce(
        (sum, share) => sum + share.currentDownloadCount,
        0,
      ),
    };

    return {
      items: paginatedItems,
      summary,
      file: {
        id: file.id,
        name: file.name,
        path: file.folderId,
        mimeType: file.mimeType,
      },
    };
  }

  // ── Q-3: 파일별 전체 목록 ──

  /**
   * 파일별 그룹 목록 조회 (Q-3 API)
   *
   * 모든 공유 요청을 파일 기준으로 그룹핑하여 조회합니다.
   * 각 파일에 대해 관련 요청 목록과 상태별 요약 통계를 포함합니다.
   *
   * @param options 필터 및 페이지네이션 옵션
   * @returns 파일별 그룹 목록 및 전체 건수
   */
  async getFileGroupList(options: {
    status?: string;
    q?: string;
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<FileGroupListResult> {
    // 1. 전체 ShareRequest 조회 (상태 필터 적용)
    const filter: ShareRequestFilter = {};
    if (options.status) {
      filter.status = options.status as ShareRequestStatus;
    }

    const allRequests = await this.shareRequestDomainService.필터조회(filter, {
      page: 1,
      pageSize: 10000, // 전체 조회
    });

    // 2. 모든 요청에서 fileId별로 그룹핑
    const fileGroupMap = new Map<string, ShareRequest[]>();
    for (const request of allRequests.items) {
      for (const fileId of request.fileIds) {
        if (!fileGroupMap.has(fileId)) {
          fileGroupMap.set(fileId, []);
        }
        fileGroupMap.get(fileId)!.push(request);
      }
    }

    // 3. 파일 정보 배치 조회
    const allFileIds = [...fileGroupMap.keys()];
    const fileMap = await this.batchLoadFiles(allFileIds);

    // 4. 검색어 필터링 (파일명)
    let filteredFileIds = allFileIds;
    if (options.q) {
      const searchLower = options.q.toLowerCase();
      filteredFileIds = allFileIds.filter((fileId) => {
        const file = fileMap.get(fileId);
        return file && file.name.toLowerCase().includes(searchLower);
      });
    }

    // 5. 사용자 정보 배치 조회
    const allUserIds = new Set<string>();
    for (const fileId of filteredFileIds) {
      const requests = fileGroupMap.get(fileId) || [];
      for (const req of requests) {
        allUserIds.add(req.requesterId);
        if (req.approverId) allUserIds.add(req.approverId);
        for (const target of req.targets) {
          allUserIds.add(target.userId);
        }
      }
    }
    const userMap = await this.batchLoadUsers([...allUserIds]);

    // 6. PublicShare 정보 매핑 (승인된 요청의 다운로드/조회 횟수)
    const publicShareMap = await this.loadPublicShareStats(allRequests.items);

    // 7. FileGroupItem 생성
    const groupItems: FileGroupItem[] = [];
    for (const fileId of filteredFileIds) {
      const file = fileMap.get(fileId);
      if (!file) continue;

      const requests = fileGroupMap.get(fileId) || [];
      const brief = this.toShareRequestBriefs(requests, userMap, publicShareMap);
      const summary = this.calculateGroupSummary(requests, publicShareMap);
      const latestRequestedAt = this.getLatestRequestedAt(requests);

      groupItems.push({
        file: {
          id: file.id,
          name: file.name,
          path: '', // path를 FileDetail에 추가하거나 빈 문자열
          mimeType: file.mimeType,
        },
        summary,
        latestRequestedAt,
        requests: brief,
      });
    }

    // 8. 정렬
    const sortBy = options.sortBy || 'latestRequestedAt';
    const sortOrder = options.sortOrder || 'desc';
    groupItems.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'fileName') {
        comparison = a.file.name.localeCompare(b.file.name);
      } else if (sortBy === 'requestCount') {
        comparison = a.summary.totalRequestCount - b.summary.totalRequestCount;
      } else {
        // latestRequestedAt (기본)
        comparison = new Date(a.latestRequestedAt).getTime() - new Date(b.latestRequestedAt).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // 9. 페이지네이션 적용 (그룹 단위)
    const totalItems = groupItems.length;
    const startIndex = (options.page - 1) * options.pageSize;
    const endIndex = startIndex + options.pageSize;
    const paginatedItems = groupItems.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      totalItems,
    };
  }

  // ── Q-4: 대상자별 전체 목록 ──

  /**
   * 대상자별 그룹 목록 조회 (Q-4 API)
   *
   * 모든 공유 요청을 대상자 기준으로 그룹핑하여 조회합니다.
   * 각 대상자에 대해 관련 요청 목록과 상태별 요약 통계를 포함합니다.
   *
   * @param options 필터 및 페이지네이션 옵션
   * @returns 대상자별 그룹 목록 및 전체 건수
   */
  async getTargetGroupList(options: {
    status?: string;
    q?: string;
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<TargetGroupListResult> {
    // 1. 전체 ShareRequest 조회 (상태 필터 적용)
    const filter: ShareRequestFilter = {};
    if (options.status) {
      filter.status = options.status as ShareRequestStatus;
    }

    const allRequests = await this.shareRequestDomainService.필터조회(filter, {
      page: 1,
      pageSize: 10000,
    });

    // 2. 모든 요청에서 대상자별로 그룹핑
    const targetGroupMap = new Map<string, ShareRequest[]>();
    for (const request of allRequests.items) {
      for (const target of request.targets) {
        if (!targetGroupMap.has(target.userId)) {
          targetGroupMap.set(target.userId, []);
        }
        targetGroupMap.get(target.userId)!.push(request);
      }
    }

    // 3. 사용자 정보 배치 조회 (대상자 + 요청자 + 승인자)
    const allUserIds = new Set<string>();
    for (const [targetId, requests] of targetGroupMap) {
      allUserIds.add(targetId);
      for (const req of requests) {
        allUserIds.add(req.requesterId);
        if (req.approverId) allUserIds.add(req.approverId);
        for (const t of req.targets) {
          allUserIds.add(t.userId);
        }
      }
    }
    const userMap = await this.batchLoadUsers([...allUserIds]);

    // 4. 검색어 필터링 (대상자 이름/이메일)
    let filteredTargetIds = [...targetGroupMap.keys()];
    if (options.q) {
      const searchLower = options.q.toLowerCase();
      filteredTargetIds = filteredTargetIds.filter((targetId) => {
        const user = userMap.get(targetId);
        if (!user) return false;
        return (
          user.name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower)
        );
      });
    }

    // 5. PublicShare 정보 매핑
    const publicShareMap = await this.loadPublicShareStats(allRequests.items);

    // 6. TargetGroupItem 생성
    const groupItems: TargetGroupItem[] = [];
    for (const targetId of filteredTargetIds) {
      const targetUser = userMap.get(targetId);
      if (!targetUser) continue;

      const requests = targetGroupMap.get(targetId) || [];
      const brief = this.toShareRequestBriefs(requests, userMap, publicShareMap);
      const summary = this.calculateGroupSummary(requests, publicShareMap);
      const latestRequestedAt = this.getLatestRequestedAt(requests);

      groupItems.push({
        target: targetUser,
        summary,
        latestRequestedAt,
        requests: brief,
      });
    }

    // 7. 정렬
    const sortBy = options.sortBy || 'latestRequestedAt';
    const sortOrder = options.sortOrder || 'desc';
    groupItems.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'targetName') {
        comparison = a.target.name.localeCompare(b.target.name);
      } else if (sortBy === 'requestCount') {
        comparison = a.summary.totalRequestCount - b.summary.totalRequestCount;
      } else {
        comparison = new Date(a.latestRequestedAt).getTime() - new Date(b.latestRequestedAt).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // 8. 페이지네이션 적용 (대상자 단위)
    const totalItems = groupItems.length;
    const startIndex = (options.page - 1) * options.pageSize;
    const endIndex = startIndex + options.pageSize;
    const paginatedItems = groupItems.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      totalItems,
    };
  }

  // ── Q-3/Q-4 공통 헬퍼 ──

  /**
   * ShareRequest 배열을 ShareRequestBrief 배열로 변환
   */
  private toShareRequestBriefs(
    requests: ShareRequest[],
    userMap: Map<string, UserDetail>,
    publicShareMap: Map<string, { currentDownloadCount: number; currentViewCount: number }>,
  ): ShareRequestBrief[] {
    return requests.map((req) => {
      const requester = userMap.get(req.requesterId) as InternalUserDetail;
      const targets = req.targets
        .map((t) => userMap.get(t.userId))
        .filter((u): u is UserDetail => u != null);
      const approver = req.approverId
        ? (userMap.get(req.approverId) as InternalUserDetail | undefined)
        : undefined;

      // 승인된 요청의 PublicShare 통계 집계
      let currentDownloadCount: number | undefined;
      let currentViewCount: number | undefined;
      if (req.status === ShareRequestStatus.APPROVED && req.publicShareIds?.length > 0) {
        currentDownloadCount = 0;
        currentViewCount = 0;
        for (const psId of req.publicShareIds) {
          const stats = publicShareMap.get(psId);
          if (stats) {
            currentDownloadCount += stats.currentDownloadCount;
            currentViewCount += stats.currentViewCount;
          }
        }
      }

      return {
        id: req.id,
        status: req.status,
        requester,
        targets,
        permission: req.permission.type,
        maxDownloads: req.permission.maxDownloads,
        currentDownloadCount,
        currentViewCount,
        startAt: req.startAt,
        endAt: req.endAt,
        requestedAt: req.requestedAt,
        reason: req.reason,
        approver,
        decidedAt: req.decidedAt,
      } as ShareRequestBrief;
    });
  }

  /**
   * 그룹 요약 정보 계산
   */
  private calculateGroupSummary(
    requests: ShareRequest[],
    publicShareMap: Map<string, { currentDownloadCount: number; currentViewCount: number }>,
  ): GroupSummary {
    let activeShareCount = 0;

    const statusCounts = {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      canceledCount: 0,
    };

    for (const req of requests) {
      switch (req.status) {
        case ShareRequestStatus.PENDING:
          statusCounts.pendingCount++;
          break;
        case ShareRequestStatus.APPROVED:
          statusCounts.approvedCount++;
          // 승인된 요청의 활성 공유 수
          if (req.publicShareIds?.length > 0) {
            activeShareCount += req.publicShareIds.filter((id) => publicShareMap.has(id)).length;
          }
          break;
        case ShareRequestStatus.REJECTED:
          statusCounts.rejectedCount++;
          break;
        case ShareRequestStatus.CANCELED:
          statusCounts.canceledCount++;
          break;
      }
    }

    return {
      totalRequestCount: requests.length,
      ...statusCounts,
      activeShareCount,
    };
  }

  /**
   * 가장 최근 요청일 조회
   */
  private getLatestRequestedAt(requests: ShareRequest[]): Date {
    if (requests.length === 0) return new Date();
    return requests.reduce((latest, req) => {
      const reqDate = new Date(req.requestedAt);
      return reqDate > latest ? reqDate : latest;
    }, new Date(0));
  }

  /**
   * PublicShare 통계 정보 배치 로드
   * 승인된 요청의 publicShareIds로부터 다운로드/조회 횟수를 조회
   */
  private async loadPublicShareStats(
    requests: ShareRequest[],
  ): Promise<Map<string, { currentDownloadCount: number; currentViewCount: number }>> {
    const map = new Map<string, { currentDownloadCount: number; currentViewCount: number }>();

    // 모든 publicShareIds 수집
    const allPublicShareIds = new Set<string>();
    for (const req of requests) {
      if (req.status === ShareRequestStatus.APPROVED && req.publicShareIds?.length > 0) {
        for (const psId of req.publicShareIds) {
          allPublicShareIds.add(psId);
        }
      }
    }

    if (allPublicShareIds.size === 0) return map;

    // PublicShare 배치 조회
    const results = await Promise.all(
      [...allPublicShareIds].map(async (psId) => {
        try {
          const share = await this.publicShareDomainService.조회(psId);
          if (share && share.isValid()) {
            return {
              id: psId,
              currentDownloadCount: share.currentDownloadCount,
              currentViewCount: share.currentViewCount,
            };
          }
        } catch {
          // 공유가 삭제된 경우 무시
        }
        return null;
      }),
    );

    for (const result of results) {
      if (result) {
        map.set(result.id, {
          currentDownloadCount: result.currentDownloadCount,
          currentViewCount: result.currentViewCount,
        });
      }
    }

    return map;
  }

  // ── Enrichment 메서드 ──

  /**
   * 단건 ShareRequest를 enrichment하여 파일/사용자 상세 정보를 첨부
   *
   * @param entity ShareRequest 도메인 엔티티
   * @returns EnrichedShareRequest (파일, 요청자, 대상자, 승인자 상세 정보 포함)
   */
  async enrichShareRequest(entity: ShareRequest): Promise<EnrichedShareRequest> {
    const [enriched] = await this.enrichShareRequests([entity]);
    return enriched;
  }

  /**
   * 복수 ShareRequest를 배치 enrichment (N+1 문제 방지)
   *
   * 모든 엔티티에서 고유 userId, fileId를 추출하여 한 번에 조회한 뒤 매핑합니다.
   *
   * @param entities ShareRequest 도메인 엔티티 배열
   * @returns EnrichedShareRequest 배열
   */
  async enrichShareRequests(entities: ShareRequest[]): Promise<EnrichedShareRequest[]> {
    if (entities.length === 0) return [];

    // 1. 모든 고유 ID 추출
    const allFileIds = new Set<string>();
    const allUserIds = new Set<string>();

    for (const entity of entities) {
      for (const fileId of entity.fileIds) {
        allFileIds.add(fileId);
      }
      allUserIds.add(entity.requesterId);
      allUserIds.add(entity.designatedApproverId);
      if (entity.approverId) {
        allUserIds.add(entity.approverId);
      }
      for (const target of entity.targets) {
        allUserIds.add(target.userId);
      }
    }

    // 2. 배치 조회
    const [fileMap, userMap] = await Promise.all([
      this.batchLoadFiles([...allFileIds]),
      this.batchLoadUsers([...allUserIds]),
    ]);

    // 3. 각 엔티티에 enrichment 데이터 매핑
    return entities.map((entity) => {
      const files: FileDetail[] = entity.fileIds
        .map((fileId) => fileMap.get(fileId))
        .filter((f): f is FileDetail => f != null);

      const requesterDetail = userMap.get(entity.requesterId) as InternalUserDetail | undefined;

      const enrichedTargets: EnrichedShareTarget[] = entity.targets.map((target) => ({
        type: target.type,
        userId: target.userId,
        userDetail: userMap.get(target.userId),
      }));

      const designatedApproverDetail = userMap.get(entity.designatedApproverId) as InternalUserDetail | undefined;

      const approverDetail = entity.approverId
        ? (userMap.get(entity.approverId) as InternalUserDetail | undefined)
        : undefined;

      return Object.assign(Object.create(Object.getPrototypeOf(entity)), entity, {
        files,
        requesterDetail,
        enrichedTargets,
        designatedApproverDetail,
        approverDetail,
      }) as EnrichedShareRequest;
    });
  }

  /**
   * 파일 ID 목록으로부터 FileDetail 배치 조회
   */
  private async batchLoadFiles(fileIds: string[]): Promise<Map<string, FileDetail>> {
    const map = new Map<string, FileDetail>();
    const results = await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const file = await this.fileDomainService.조회(fileId);
          if (file) {
            return {
              id: file.id,
              name: file.name,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
            } as FileDetail;
          }
        } catch {
          // 파일이 삭제된 경우 등 — 무시
        }
        return null;
      }),
    );
    for (let i = 0; i < fileIds.length; i++) {
      if (results[i]) {
        map.set(fileIds[i], results[i]!);
      }
    }
    return map;
  }

  /**
   * 사용자 ID 목록으로부터 UserDetail 배치 조회 (내부/외부 자동 판별)
   */
  private async batchLoadUsers(userIds: string[]): Promise<Map<string, UserDetail>> {
    const map = new Map<string, UserDetail>();
    const results = await Promise.all(
      userIds.map(async (userId) => {
        try {
          return await this.getUserDetail(userId);
        } catch {
          return null;
        }
      }),
    );
    for (let i = 0; i < userIds.length; i++) {
      if (results[i]) {
        map.set(userIds[i], results[i]!);
      }
    }
    return map;
  }

  // ── 사용자 상세 정보 조회 헬퍼 ──

  /**
   * 사용자 상세 정보 조회 (내부 또는 외부)
   */
  private async getUserDetail(userId: string): Promise<UserDetail | null> {
    // 먼저 내부 사용자로 시도
    const internalUser = await this.getInternalUserDetail(userId);
    if (internalUser) {
      return internalUser;
    }

    // 외부 사용자로 시도
    const externalUser = await this.getExternalUserDetail(userId);
    if (externalUser) {
      return externalUser;
    }

    return null;
  }

  /**
   * 내부 사용자 상세 정보 조회
   */
  private async getInternalUserDetail(
    userId: string,
  ): Promise<InternalUserDetail | null> {
    const employee = await this.employeeService.findOne(userId);
    if (!employee) {
      return null;
    }
    

    // 부서 정보 조회 (EmployeeDepartmentPosition에서)
    // departmentPositions는 관계이므로 로드되지 않을 수 있음
    // 간단히 하기 위해 departmentPositions의 첫 번째 항목 사용
    // 관계가 로드되지 않은 경우 빈 문자열 사용
    const department =
      employee.departmentPositions && employee.departmentPositions.length > 0
        ? employee.departmentPositions[0].department?.departmentName || ''
        : '';

    // 직급 정보 조회 (rank는 ManyToOne 관계이므로 로드되지 않을 수 있음)
    const position = employee.rank?.rankTitle;

    return {
      type: 'INTERNAL_USER',
      userId: employee.id,
      name: employee.name,
      email: employee.email || '',
      department,
      position,
    };
  }

  /**
   * 외부 사용자 상세 정보 조회
   */
  private async getExternalUserDetail(
    userId: string,
  ): Promise<ExternalUserDetail | null> {
    const externalUser = await this.externalUserDomainService.조회(userId);
    if (!externalUser) {
      return null;
    }

    return {
      type: 'EXTERNAL_USER',
      userId: externalUser.id,
      name: externalUser.name,
      email: externalUser.email,
      company: externalUser.company,
      department: externalUser.department,
      phone: externalUser.phone,
    };
  }
}
