import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileActionRequest } from '../../../../domain/file-action-request/entities/file-action-request.entity';

/**
 * 파일 작업 요청 응답 DTO
 */
export class FileActionRequestResponseDto {
  @ApiProperty({ description: '요청 ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ description: '요청 타입', example: 'MOVE', enum: ['MOVE', 'DELETE'] })
  type: string;

  @ApiProperty({ description: '요청 상태', example: 'PENDING', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'EXECUTED', 'INVALIDATED', 'FAILED'] })
  status: string;

  @ApiProperty({ description: '파일 ID', example: '550e8400-e29b-41d4-a716-446655440010' })
  fileId: string;

  @ApiProperty({ description: '파일명', example: 'report.pdf' })
  fileName: string;

  @ApiPropertyOptional({ description: '원본 폴더 ID' })
  sourceFolderId?: string;

  @ApiPropertyOptional({ description: '대상 폴더 ID (MOVE인 경우)' })
  targetFolderId?: string;

  @ApiProperty({ description: '요청자 ID' })
  requesterId: string;

  @ApiProperty({ description: '지정 승인자 ID' })
  designatedApproverId: string;

  @ApiPropertyOptional({ description: '실제 승인/반려 처리자 ID' })
  approverId?: string;

  @ApiProperty({ description: '요청 사유', example: '프로젝트 정리를 위해 이동이 필요합니다.' })
  reason: string;

  @ApiPropertyOptional({ description: '결정 코멘트' })
  decisionComment?: string;

  @ApiPropertyOptional({ description: '실행 메모 (INVALIDATED/FAILED 시)' })
  executionNote?: string;

  @ApiProperty({ description: '요청일시', example: '2026-02-11T09:00:00.000Z' })
  requestedAt: Date;

  @ApiPropertyOptional({ description: '결정일시' })
  decidedAt?: Date;

  @ApiPropertyOptional({ description: '실행일시' })
  executedAt?: Date;

  /**
   * 도메인 엔티티로부터 응답 DTO 생성
   */
  static fromEntity(entity: FileActionRequest): FileActionRequestResponseDto {
    const dto = new FileActionRequestResponseDto();
    dto.id = entity.id;
    dto.type = entity.type;
    dto.status = entity.status;
    dto.fileId = entity.fileId;
    dto.fileName = entity.fileName;
    dto.sourceFolderId = entity.sourceFolderId;
    dto.targetFolderId = entity.targetFolderId;
    dto.requesterId = entity.requesterId;
    dto.designatedApproverId = entity.designatedApproverId;
    dto.approverId = entity.approverId;
    dto.reason = entity.reason;
    dto.decisionComment = entity.decisionComment;
    dto.executionNote = entity.executionNote;
    dto.requestedAt = entity.requestedAt;
    dto.decidedAt = entity.decidedAt;
    dto.executedAt = entity.executedAt;
    return dto;
  }
}
