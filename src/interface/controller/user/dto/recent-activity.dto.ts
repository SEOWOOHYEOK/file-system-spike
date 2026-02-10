import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { AuditAction } from '../../../../domain/audit/enums/audit-action.enum';

/**
 * 파일/폴더 관련 액션 상수
 * - 사용자 최근 활동 조회에서 허용되는 액션 목록
 */
export const FILE_FOLDER_ACTIONS: AuditAction[] = [
  // 파일 관련
  AuditAction.FILE_VIEW,
  AuditAction.FILE_DOWNLOAD,
  AuditAction.FILE_UPLOAD,
  AuditAction.FILE_RENAME,
  AuditAction.FILE_MOVE,
  AuditAction.FILE_DELETE,
  AuditAction.FILE_RESTORE,
  AuditAction.FILE_PURGE,
  // 폴더 관련
  AuditAction.FOLDER_CREATE,
  AuditAction.FOLDER_VIEW,
  AuditAction.FOLDER_RENAME,
  AuditAction.FOLDER_MOVE,
  AuditAction.FOLDER_DELETE,
];

/**
 * 사용자 최근 활동 조회 쿼리 DTO
 * - PaginationQueryDto 확장 (page, pageSize, sortBy, sortOrder)
 * - actions: 콤마 구분 액션 필터 (파일/폴더 액션만 허용)
 */
export class RecentActivitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      '필터할 액션 (쉼표 구분). 미지정 시 파일/폴더 전체 액션 조회. ' +
      '허용 값: FILE_VIEW, FILE_DOWNLOAD, FILE_UPLOAD, FILE_RENAME, FILE_MOVE, FILE_DELETE, FILE_RESTORE, FILE_PURGE, ' +
      'FOLDER_CREATE, FOLDER_VIEW, FOLDER_RENAME, FOLDER_MOVE, FOLDER_DELETE',
    example: 'FILE_VIEW,FILE_DOWNLOAD',
  })
  @IsOptional()
  @IsString()
  actions?: string;
}

/**
 * 최근 활동 항목 DTO
 */
export class RecentActivityItemDto {
  @ApiProperty({ description: '액션 타입', example: 'FILE_DOWNLOAD' })
  action: string;

  @ApiProperty({ description: '액션 카테고리', example: 'FILE' })
  actionCategory: string;

  @ApiProperty({ description: '대상 타입', example: 'FILE' })
  targetType: string;

  @ApiProperty({ description: '대상 ID' })
  targetId: string;

  @ApiProperty({ description: '대상 이름', example: '계약서.pdf' })
  targetName: string;

  @ApiPropertyOptional({
    description: '대상 경로',
    example: '/documents/contracts/',
  })
  targetPath?: string;

  @ApiProperty({ description: '결과', example: 'SUCCESS' })
  result: string;

  @ApiProperty({ description: '활동 시각' })
  createdAt: Date;
}
