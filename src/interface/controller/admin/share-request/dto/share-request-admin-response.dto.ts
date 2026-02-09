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
} from '../../../../../business/share-request/types/share-request-query.types';
import { PaginatedResponseDto } from '../../../../common/dto/pagination.dto';

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

  @ApiProperty({ description: '승인자 ID', format: 'uuid', required: false })
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
   * ShareRequest 엔티티로부터 응답 DTO 생성
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
    dto.approverId = entity.approverId;
    dto.decidedAt = entity.decidedAt;
    dto.decisionComment = entity.decisionComment;
    dto.isAutoApproved = entity.isAutoApproved;
    dto.publicShareIds = entity.publicShareIds;
    dto.requestedAt = entity.requestedAt;
    dto.updatedAt = entity.updatedAt;
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
 */
export class SharesByTargetResponseDto extends PaginatedResponseDto<ShareItemResult> {
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
    dto.page = pagination.page;
    dto.pageSize = pagination.pageSize;
    dto.totalItems = pagination.totalItems;
    dto.totalPages = Math.ceil(pagination.totalItems / pagination.pageSize);
    dto.hasNext = pagination.page < dto.totalPages;
    dto.hasPrev = pagination.page > 1;
    return dto;
  }
}

/**
 * 파일별 조회 응답 DTO (Q-2)
 */
export class SharesByFileResponseDto extends PaginatedResponseDto<ShareItemResult> {
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
    dto.page = pagination.page;
    dto.pageSize = pagination.pageSize;
    dto.totalItems = pagination.totalItems;
    dto.totalPages = Math.ceil(pagination.totalItems / pagination.pageSize);
    dto.hasNext = pagination.page < dto.totalPages;
    dto.hasPrev = pagination.page > 1;
    return dto;
  }
}
