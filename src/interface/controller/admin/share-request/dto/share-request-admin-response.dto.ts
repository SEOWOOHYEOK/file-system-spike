import { ApiProperty } from '@nestjs/swagger';
import { ShareRequest } from '../../../../../domain/share-request/entities/share-request.entity';
import { ShareRequestStatus } from '../../../../../domain/share-request/type/share-request-status.enum';
import type {
  InternalUserDetail,
  ExternalUserDetail,
  UserDetail,
  ShareItemResult,
  SharesByTargetResult,
  SharesByFileResult,
  FileDetail,
  EnrichedShareRequest,
  ShareRequestBrief,
  GroupSummary,
  FileGroupItem,
  TargetGroupItem,
  FileGroupListResult,
  TargetGroupListResult,
} from '../../../../../business/share-request/types/share-request-query.types';
import { PaginatedResponseDto } from '../../../../common/dto';
import { createPaginationInfo } from '../../../../../common/types/pagination';

/**
 * 상태별 요약 응답 DTO (A-1)
 */
export class ShareRequestSummaryDto {
  @ApiProperty({
    description: '상태별 요청 개수',
    example: {
      PENDING: 5,
      APPROVED: 10,
      REJECTED: 2,
      CANCELED: 1,
    },
  })
  [ShareRequestStatus.PENDING]: number;

  @ApiProperty({ description: '승인된 요청 수', example: 10 })
  [ShareRequestStatus.APPROVED]: number;

  @ApiProperty({ description: '반려된 요청 수', example: 2 })
  [ShareRequestStatus.REJECTED]: number;

  @ApiProperty({ description: '취소된 요청 수', example: 1 })
  [ShareRequestStatus.CANCELED]: number;
}

/**
 * 공유 요청 상세 응답 DTO (관리자용, A-3)
 * 
 * 기본 ShareRequest 정보에 요청자, 승인자, 대상자 등의 상세 정보를 포함
 */
export class ShareRequestAdminDetailDto {
  @ApiProperty({ description: '공유 요청 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '요청 상태', enum: ShareRequestStatus })
  status: ShareRequestStatus;

  @ApiProperty({ description: '공유할 파일 ID 목록', type: [String] })
  fileIds: string[];

  @ApiProperty({
    description: '공유 파일 상세 정보 목록',
    type: 'array',
    required: false,
    example: [
      { id: '550e8400-e29b-41d4-a716-446655440010', name: '보고서.pdf', mimeType: 'application/pdf', sizeBytes: 1048576 },
    ],
  })
  files?: FileDetail[];

  @ApiProperty({ description: '요청자 ID', format: 'uuid' })
  requesterId: string;

  @ApiProperty({ description: '요청자 정보' })
  requester?: InternalUserDetail;

  @ApiProperty({ description: '공유 대상 목록', type: 'array' })
  targets: Array<{
    type: string;
    userId: string;
    userDetail?: UserDetail;
  }>;

  @ApiProperty({ description: '부여할 권한' })
  permission: {
    type: string;
    maxDownloads?: number;
  };

  @ApiProperty({ description: '공유 시작일시', format: 'date-time' })
  startAt: Date;

  @ApiProperty({ description: '공유 종료일시', format: 'date-time' })
  endAt: Date;

  @ApiProperty({ description: '공유 요청 사유' })
  reason: string;

  @ApiProperty({ description: '지정 승인 대상자 ID', format: 'uuid' })
  designatedApproverId: string;

  @ApiProperty({ description: '지정 승인자 상세 정보', required: false })
  designatedApproverDetail?: InternalUserDetail;

  @ApiProperty({ description: '실제 승인/반려 처리자 ID', format: 'uuid', required: false })
  approverId?: string;

  @ApiProperty({ description: '승인자 정보', required: false })
  approver?: InternalUserDetail;

  @ApiProperty({ description: '결정일시', format: 'date-time', required: false })
  decidedAt?: Date;

  @ApiProperty({ description: '결정 코멘트', required: false })
  decisionComment?: string;

  @ApiProperty({ description: '자동 승인 여부' })
  isAutoApproved: boolean;

  @ApiProperty({ description: '생성된 공유 ID 목록', type: [String] })
  publicShareIds: string[];

  @ApiProperty({ description: '요청일시', format: 'date-time' })
  requestedAt: Date;

  @ApiProperty({ description: '수정일시', format: 'date-time', required: false })
  updatedAt?: Date;

  /**
   * ShareRequest 엔티티로부터 응답 DTO 생성 (하위 호환성 유지)
   */
  static fromEntity(entity: ShareRequest): ShareRequestAdminDetailDto {
    const dto = new ShareRequestAdminDetailDto();
    dto.id = entity.id;
    dto.status = entity.status;
    dto.fileIds = entity.fileIds;
    dto.requesterId = entity.requesterId;
    dto.targets = entity.targets.map((target) => ({
      type: target.type,
      userId: target.userId,
    }));
    dto.permission = {
      type: entity.permission.type,
      maxDownloads: entity.permission.maxDownloads,
    };
    dto.startAt = entity.startAt;
    dto.endAt = entity.endAt;
    dto.reason = entity.reason;
    dto.designatedApproverId = entity.designatedApproverId;
    dto.approverId = entity.approverId;
    dto.decidedAt = entity.decidedAt;
    dto.decisionComment = entity.decisionComment;
    dto.isAutoApproved = entity.isAutoApproved;
    dto.publicShareIds = entity.publicShareIds;
    dto.requestedAt = entity.requestedAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  /**
   * Enriched 데이터로부터 응답 DTO 생성 (파일/사용자 상세 정보 포함)
   */
  static fromEnriched(enriched: EnrichedShareRequest): ShareRequestAdminDetailDto {
    const dto = ShareRequestAdminDetailDto.fromEntity(enriched);
    dto.files = enriched.files;
    dto.requester = enriched.requesterDetail;
    dto.targets = enriched.enrichedTargets.map((t) => ({
      type: t.type,
      userId: t.userId,
      userDetail: t.userDetail,
    }));
    dto.designatedApproverDetail = enriched.designatedApproverDetail;
    dto.approver = enriched.approverDetail;
    return dto;
  }
}

/**
 * 일괄 결정 응답 항목 DTO
 */
export class BulkDecisionItemDto {
  @ApiProperty({ description: '요청 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '처리 성공 여부' })
  success: boolean;

  @ApiProperty({ description: '에러 메시지', required: false })
  error?: string;
}

/**
 * 일괄 결정 응답 DTO (A-6, A-7)
 */
export class BulkDecisionResponseDto {
  @ApiProperty({ description: '처리된 요청 수', example: 5 })
  processedCount: number;

  @ApiProperty({
    description: '처리 결과 항목 목록',
    type: [BulkDecisionItemDto],
  })
  items: BulkDecisionItemDto[];
}

/**
 * 대상자별 조회 응답 DTO (Q-1)
 * 
 * PaginatedResponseDto를 상속하여 공통 페이지네이션 필드를 재사용하고,
 * items는 Swagger 타입 추론을 위해 @ApiProperty로 명시적 override
 */
export class SharesByTargetResponseDto extends PaginatedResponseDto<ShareItemResult> {
  @ApiProperty({ description: '공유 항목 목록', type: 'array' })
  items: ShareItemResult[] = [];

  @ApiProperty({ description: '대상 사용자 정보' })
  target: UserDetail;

  @ApiProperty({
    description: '요약 정보',
    example: {
      activeShareCount: 3,
      pendingRequestCount: 2,
      totalViewCount: 50,
      totalDownloadCount: 10,
    },
  })
  summary: {
    activeShareCount: number;
    pendingRequestCount: number;
    totalViewCount: number;
    totalDownloadCount: number;
  };

  /**
   * SharesByTargetResult로부터 응답 DTO 생성
   */
  static fromResult(
    result: SharesByTargetResult,
    pagination: { page: number; pageSize: number; totalItems: number },
  ): SharesByTargetResponseDto {
    const dto = new SharesByTargetResponseDto();
    dto.items = result.items;
    dto.target = result.target;
    dto.summary = result.summary;
    const info = createPaginationInfo(pagination.page, pagination.pageSize, pagination.totalItems);
    Object.assign(dto, info);
    return dto;
  }
}

/**
 * 파일별 조회 응답 DTO (Q-2)
 * 
 * PaginatedResponseDto를 상속하여 공통 페이지네이션 필드를 재사용하고,
 * items는 Swagger 타입 추론을 위해 @ApiProperty로 명시적 override
 */
export class SharesByFileResponseDto extends PaginatedResponseDto<ShareItemResult> {
  @ApiProperty({ description: '공유 항목 목록', type: 'array' })
  items: ShareItemResult[] = [];

  @ApiProperty({
    description: '파일 정보',
    example: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: '문서.pdf',
      path: '/folder1',
      mimeType: 'application/pdf',
    },
  })
  file: {
    id: string;
    name: string;
    path: string;
    mimeType: string;
  };

  @ApiProperty({
    description: '요약 정보',
    example: {
      activeShareCount: 3,
      pendingRequestCount: 2,
      totalViewCount: 50,
      totalDownloadCount: 10,
    },
  })
  summary: {
    activeShareCount: number;
    pendingRequestCount: number;
    totalViewCount: number;
    totalDownloadCount: number;
  };

  /**
   * SharesByFileResult로부터 응답 DTO 생성
   */
  static fromResult(
    result: SharesByFileResult,
    pagination: { page: number; pageSize: number; totalItems: number },
  ): SharesByFileResponseDto {
    const dto = new SharesByFileResponseDto();
    dto.items = result.items;
    dto.file = result.file;
    dto.summary = result.summary;
    const info = createPaginationInfo(pagination.page, pagination.pageSize, pagination.totalItems);
    Object.assign(dto, info);
    return dto;
  }
}

// ── Q-3, Q-4: 그룹 목록 응답 DTO ──

/**
 * 요청 간략 정보 DTO (그룹 목록의 중첩 아이템)
 */
export class ShareRequestBriefDto {
  @ApiProperty({ description: '요청 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '요청 상태', enum: ShareRequestStatus })
  status: string;

  @ApiProperty({ description: '요청자 정보' })
  requester: InternalUserDetail;

  @ApiProperty({ description: '대상자 목록', type: 'array' })
  targets: UserDetail[];

  @ApiProperty({ description: '권한: VIEW | DOWNLOAD' })
  permission: string;

  @ApiProperty({ description: '최대 다운로드 허용 횟수', required: false })
  maxDownloads?: number;

  @ApiProperty({ description: '현재 다운로드 횟수 (승인 후 활성 공유)', required: false })
  currentDownloadCount?: number;

  @ApiProperty({ description: '현재 열람 횟수 (승인 후 활성 공유)', required: false })
  currentViewCount?: number;

  @ApiProperty({ description: '공유 시작일', format: 'date-time' })
  startAt: Date;

  @ApiProperty({ description: '공유 종료일', format: 'date-time' })
  endAt: Date;

  @ApiProperty({ description: '요청일', format: 'date-time' })
  requestedAt: Date;

  @ApiProperty({ description: '요청 사유' })
  reason: string;

  @ApiProperty({ description: '승인/반려 처리자', required: false })
  approver?: InternalUserDetail;

  @ApiProperty({ description: '결정일시', format: 'date-time', required: false })
  decidedAt?: Date;

  static fromBrief(brief: ShareRequestBrief): ShareRequestBriefDto {
    const dto = new ShareRequestBriefDto();
    Object.assign(dto, brief);
    return dto;
  }
}

/**
 * 그룹 요약 정보 DTO (파일별/대상자별 공통)
 */
export class GroupSummaryDto {
  @ApiProperty({ description: '전체 요청 건수', example: 10 })
  totalRequestCount: number;

  @ApiProperty({ description: '대기 중 요청 건수', example: 3 })
  pendingCount: number;

  @ApiProperty({ description: '승인된 요청 건수', example: 5 })
  approvedCount: number;

  @ApiProperty({ description: '반려된 요청 건수', example: 1 })
  rejectedCount: number;

  @ApiProperty({ description: '취소된 요청 건수', example: 1 })
  canceledCount: number;

  @ApiProperty({ description: '현재 활성 공유 수', example: 4 })
  activeShareCount: number;
}

/**
 * 파일별 그룹 아이템 DTO (Q-3)
 */
export class FileGroupItemDto {
  @ApiProperty({
    description: '파일 정보',
    example: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: '보고서.pdf',
      path: '/folder1',
      mimeType: 'application/pdf',
    },
  })
  file: {
    id: string;
    name: string;
    path: string;
    mimeType: string;
  };

  @ApiProperty({ description: '요약 통계', type: GroupSummaryDto })
  summary: GroupSummaryDto;

  @ApiProperty({ description: '가장 최근 요청일', format: 'date-time' })
  latestRequestedAt: Date;

  @ApiProperty({ description: '관련 요청 목록', type: [ShareRequestBriefDto] })
  requests: ShareRequestBriefDto[];

  static fromItem(item: FileGroupItem): FileGroupItemDto {
    const dto = new FileGroupItemDto();
    dto.file = item.file;
    dto.summary = item.summary;
    dto.latestRequestedAt = item.latestRequestedAt;
    dto.requests = item.requests.map(ShareRequestBriefDto.fromBrief);
    return dto;
  }
}

/**
 * 대상자별 그룹 아이템 DTO (Q-4)
 */
export class TargetGroupItemDto {
  @ApiProperty({ description: '대상자 정보' })
  target: UserDetail;

  @ApiProperty({ description: '요약 통계', type: GroupSummaryDto })
  summary: GroupSummaryDto;

  @ApiProperty({ description: '가장 최근 요청일', format: 'date-time' })
  latestRequestedAt: Date;

  @ApiProperty({ description: '관련 요청 목록', type: [ShareRequestBriefDto] })
  requests: ShareRequestBriefDto[];

  static fromItem(item: TargetGroupItem): TargetGroupItemDto {
    const dto = new TargetGroupItemDto();
    dto.target = item.target;
    dto.summary = item.summary;
    dto.latestRequestedAt = item.latestRequestedAt;
    dto.requests = item.requests.map(ShareRequestBriefDto.fromBrief);
    return dto;
  }
}

/**
 * 파일별 그룹 목록 응답 DTO (Q-3)
 */
export class FileGroupListResponseDto extends PaginatedResponseDto<FileGroupItemDto> {
  @ApiProperty({ description: '파일별 그룹 목록', type: [FileGroupItemDto] })
  items: FileGroupItemDto[] = [];

  static fromResult(
    result: FileGroupListResult,
    page: number,
    pageSize: number,
  ): FileGroupListResponseDto {
    const dto = new FileGroupListResponseDto();
    dto.items = result.items.map(FileGroupItemDto.fromItem);
    const info = createPaginationInfo(page, pageSize, result.totalItems);
    Object.assign(dto, info);
    return dto;
  }
}

/**
 * 대상자별 그룹 목록 응답 DTO (Q-4)
 */
export class TargetGroupListResponseDto extends PaginatedResponseDto<TargetGroupItemDto> {
  @ApiProperty({ description: '대상자별 그룹 목록', type: [TargetGroupItemDto] })
  items: TargetGroupItemDto[] = [];

  static fromResult(
    result: TargetGroupListResult,
    page: number,
    pageSize: number,
  ): TargetGroupListResponseDto {
    const dto = new TargetGroupListResponseDto();
    dto.items = result.items.map(TargetGroupItemDto.fromItem);
    const info = createPaginationInfo(page, pageSize, result.totalItems);
    Object.assign(dto, info);
    return dto;
  }
}
