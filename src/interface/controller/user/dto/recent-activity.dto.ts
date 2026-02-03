import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 최근 활동 조회 쿼리 DTO
 */
export class RecentActivitiesQueryDto {
  @ApiPropertyOptional({
    description: '조회 개수 (기본 20, 최대 100)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: '필터할 액션 (쉼표 구분)',
    example: 'FILE_VIEW,FILE_DOWNLOAD,FILE_UPLOAD //export enum AuditAction 참고',
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

  @ApiProperty({ description: '액션 카테고리', example: 'file' })
  actionCategory: string;

  @ApiProperty({ description: '대상 타입', example: 'file' })
  targetType: string;

  @ApiProperty({ description: '대상 ID' })
  targetId: string;

  @ApiProperty({ description: '대상 이름', example: '계약서.pdf' })
  targetName: string;

  @ApiPropertyOptional({ description: '대상 경로', example: '/documents/contracts/' })
  targetPath?: string;

  @ApiProperty({ description: '결과', example: 'SUCCESS' })
  result: string;

  @ApiProperty({ description: '활동 시각' })
  createdAt: Date;
}

/**
 * 최근 활동 응답 DTO
 */
export class RecentActivitiesResponseDto {
  @ApiProperty({ description: '사용자 ID' })
  userId: string;

  @ApiProperty({ description: '활동 목록', type: [RecentActivityItemDto] })
  activities: RecentActivityItemDto[];

  @ApiProperty({ description: '총 개수' })
  total: number;
}
