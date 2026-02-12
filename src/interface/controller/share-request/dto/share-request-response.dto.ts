import { ApiProperty } from '@nestjs/swagger';
import { ShareRequest } from '../../../../domain/share-request/entities/share-request.entity';
import type { ShareTarget } from '../../../../domain/share-request/type/share-target.type';
import type { Permission } from '../../../../domain/share-request/type/share-permission.type';
import type { AvailabilityResult } from '../../../../business/share-request/share-request-validation.service';
import type {
  FileDetail,
  EnrichedShareTarget,
  EnrichedShareRequest,
  InternalUserDetail,
} from '../../../../business/share-request/types/share-request-query.types';

/**
 * 공유 요청 응답 DTO
 *
 * 기본 ShareRequest 정보와 함께, enriched 필드(파일/사용자 상세)를 포함합니다.
 * enriched 필드는 fromEnriched()로 생성 시에만 채워집니다.
 */
export class ShareRequestResponseDto {
  @ApiProperty({ description: '공유 요청 ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ description: '요청 상태', example: 'PENDING' })
  status: string;

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

  @ApiProperty({ description: '요청자 ID', example: '550e8400-e29b-41d4-a716-446655440002' })
  requesterId: string;

  @ApiProperty({
    description: '요청자 상세 정보',
    required: false,
    example: { type: 'INTERNAL_USER', userId: '550e8400-e29b-41d4-a716-446655440002', name: '홍길동', email: 'hong@company.com', department: '개발팀', position: '선임' },
  })
  requesterDetail?: InternalUserDetail;

  @ApiProperty({ description: '공유 대상 목록', type: 'array' })
  targets: ShareTarget[];

  @ApiProperty({
    description: '공유 대상 상세 정보 목록 (사용자 이름, 부서, 이메일 등 포함)',
    type: 'array',
    required: false,
    example: [
      { type: 'INTERNAL_USER', userId: '550e8400-e29b-41d4-a716-446655440004', userDetail: { type: 'INTERNAL_USER', userId: '550e8400-e29b-41d4-a716-446655440004', name: '김철수', email: 'kim@company.com', department: '기획팀', position: '매니저' } },
    ],
  })
  targetDetails?: EnrichedShareTarget[];

  @ApiProperty({ description: '부여할 권한' })
  permission: Permission;

  @ApiProperty({ description: '공유 시작일시', example: '2026-02-10T00:00:00.000Z' })
  startAt: Date;

  @ApiProperty({ description: '공유 종료일시', example: '2026-02-28T23:59:59.000Z' })
  endAt: Date;

  @ApiProperty({ description: '공유 요청 사유', example: '프로젝트 협업을 위한 파일 공유' })
  reason: string;

  @ApiProperty({ description: '지정 승인 대상자 ID', example: '550e8400-e29b-41d4-a716-446655440003' })
  designatedApproverId: string;

  @ApiProperty({
    description: '지정 승인자 상세 정보',
    required: false,
    example: { type: 'INTERNAL_USER', userId: '550e8400-e29b-41d4-a716-446655440003', name: '이영희', email: 'lee@company.com', department: '보안팀' },
  })
  designatedApproverDetail?: InternalUserDetail;

  @ApiProperty({ description: '실제 승인/반려 처리자 ID', required: false, example: '550e8400-e29b-41d4-a716-446655440003' })
  approverId?: string;

  @ApiProperty({
    description: '실제 승인/반려 처리자 상세 정보',
    required: false,
    example: { type: 'INTERNAL_USER', userId: '550e8400-e29b-41d4-a716-446655440003', name: '이영희', email: 'lee@company.com', department: '보안팀' },
  })
  approverDetail?: InternalUserDetail;

  @ApiProperty({ description: '결정일시', required: false, example: '2026-02-10T10:00:00.000Z' })
  decidedAt?: Date;

  @ApiProperty({ description: '결정 코멘트', required: false, example: '승인합니다.' })
  decisionComment?: string;

  @ApiProperty({ description: '자동 승인 여부', example: false })
  isAutoApproved: boolean;

  @ApiProperty({ description: '생성된 공유 ID 목록', type: [String] })
  publicShareIds: string[];

  @ApiProperty({ description: '요청일시', example: '2026-02-10T09:00:00.000Z' })
  requestedAt: Date;

  /**
   * 엔티티로부터 응답 DTO 생성 (하위 호환성 유지, enriched 필드 없음)
   */
  static fromEntity(entity: ShareRequest): ShareRequestResponseDto {
    const dto = new ShareRequestResponseDto();
    dto.id = entity.id;
    dto.status = entity.status;
    dto.fileIds = entity.fileIds;
    dto.requesterId = entity.requesterId;
    dto.targets = entity.targets;
    dto.permission = entity.permission;
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
    return dto;
  }

  /**
   * Enriched 데이터로부터 응답 DTO 생성 (파일/사용자 상세 정보 포함)
   */
  static fromEnriched(enriched: EnrichedShareRequest): ShareRequestResponseDto {
    const dto = ShareRequestResponseDto.fromEntity(enriched);
    dto.files = enriched.files;
    dto.requesterDetail = enriched.requesterDetail;
    dto.targetDetails = enriched.enrichedTargets;
    dto.designatedApproverDetail = enriched.designatedApproverDetail;
    dto.approverDetail = enriched.approverDetail;
    return dto;
  }
}

/**
 * 가용성 확인 결과 항목 DTO
 */
export class AvailabilityResultItemDto {
  @ApiProperty({ description: '파일 ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  fileId: string;

  @ApiProperty({ description: '파일명', example: 'document.pdf' })
  fileName: string;

  @ApiProperty({ description: '공유 대상' })
  target: ShareTarget;

  @ApiProperty({ description: '대상 사용자 이름', required: false, example: '홍길동' })
  targetName?: string;

  @ApiProperty({
    description: '가용성 상태',
    enum: ['AVAILABLE', 'ACTIVE_SHARE_EXISTS', 'PENDING_REQUEST_EXISTS'],
    example: 'AVAILABLE',
  })
  status: 'AVAILABLE' | 'ACTIVE_SHARE_EXISTS' | 'PENDING_REQUEST_EXISTS';

  @ApiProperty({ description: '충돌 정보', required: false })
  conflict?: {
    conflictType: 'ACTIVE_SHARE_EXISTS' | 'PENDING_REQUEST_EXISTS';
    fileId: string;
    targetUserId: string;
    publicShareId?: string;
    shareRequestId?: string;
    requestedAt?: Date;
    requesterName?: string;
  };
}

/**
 * 가용성 확인 응답 DTO
 */
export class CheckAvailabilityResponseDto {
  @ApiProperty({
    description: '전체 가용 여부 (모든 조합이 AVAILABLE이면 true)',
    example: true,
  })
  available: boolean;

  @ApiProperty({
    description: '각 (파일, 대상) 조합별 가용성 결과',
    type: [AvailabilityResultItemDto],
  })
  results: AvailabilityResultItemDto[];

  /**
   * AvailabilityResult 배열로부터 응답 DTO 생성
   */
  static fromResults(results: AvailabilityResult[]): CheckAvailabilityResponseDto {
    const dto = new CheckAvailabilityResponseDto();
    dto.results = results.map((result) => ({
      fileId: result.fileId,
      fileName: result.fileName,
      target: result.target,
      targetName: result.targetName,
      status: result.status,
      conflict: result.conflict,
    }));
    dto.available = results.every((r) => r.status === 'AVAILABLE');
    return dto;
  }
}
