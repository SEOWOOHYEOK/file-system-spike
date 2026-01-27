/**
 * Sync Events 조회 DTOs
 * 동기화 이벤트 문제 확인 API를 위한 DTO 정의
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import {
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../sync-event/entities/sync-event.entity';

/**
 * 동기화 이벤트 조회 Query DTO
 */
export class SyncEventsQueryDto {
  @ApiPropertyOptional({
    enum: SyncEventStatus,
    description: '이벤트 상태 필터 (미지정 시 전체 상태 조회)',
    example: 'PENDING',
  })
  @IsOptional()
  @IsEnum(SyncEventStatus)
  status?: SyncEventStatus;

  @ApiPropertyOptional({
    enum: SyncEventType,
    description: '이벤트 타입 필터',
    example: 'SYNC',
  })
  @IsOptional()
  @IsEnum(SyncEventType)
  eventType?: SyncEventType;

  @ApiPropertyOptional({
    description: '조회할 시간 범위 (시간 단위)',
    default: 24,
    minimum: 1,
    maximum: 168,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168) // 최대 1주일
  hours?: number = 24;

  @ApiPropertyOptional({
    description: '조회할 최대 개수',
    default: 100,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 100;

  @ApiPropertyOptional({
    description: '페이징 오프셋',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

/**
 * 동기화 이벤트 상세 DTO
 */
export class SyncEventDetailDto {
  @ApiProperty({ description: '이벤트 ID' })
  id: string;

  @ApiProperty({
    enum: SyncEventType,
    description: '이벤트 타입',
  })
  eventType: SyncEventType;

  @ApiProperty({
    enum: SyncEventTargetType,
    description: '대상 타입',
  })
  targetType: SyncEventTargetType;

  @ApiPropertyOptional({ description: '파일 ID (파일인 경우)' })
  fileId?: string;

  @ApiPropertyOptional({ description: '폴더 ID (폴더인 경우)' })
  folderId?: string;

  @ApiProperty({ description: '원본 경로' })
  sourcePath: string;

  @ApiProperty({ description: '대상 경로' })
  targetPath: string;

  @ApiProperty({
    enum: SyncEventStatus,
    description: '현재 상태',
  })
  status: SyncEventStatus;

  @ApiProperty({ description: '재시도 횟수' })
  retryCount: number;

  @ApiProperty({ description: '최대 재시도 횟수' })
  maxRetries: number;

  @ApiPropertyOptional({ description: '에러 메시지' })
  errorMessage?: string;

  @ApiPropertyOptional({
    description: '메타데이터',
    type: Object,
  })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: '처리 완료 시각' })
  processedAt?: Date;

  @ApiProperty({ description: '생성 시각' })
  createdAt: Date;

  @ApiProperty({ description: '수정 시각' })
  updatedAt: Date;

  @ApiProperty({
    description: 'stuck 상태 여부 (PENDING 1시간 이상, PROCESSING 30분 이상)',
  })
  isStuck: boolean;

  @ApiProperty({ description: '생성 후 경과 시간 (시간 단위)' })
  ageHours: number;
}

/**
 * 동기화 이벤트 요약 DTO
 */
export class SyncEventsSummaryDto {
  @ApiProperty({ description: '전체 이벤트 수' })
  total: number;

  @ApiProperty({ description: '실패 이벤트 수' })
  failed: number;

  @ApiProperty({ description: '대기 중 이벤트 수' })
  pending: number;

  @ApiProperty({ description: '처리 중 이벤트 수' })
  processing: number;

  @ApiProperty({ description: '완료된 이벤트 수' })
  done: number;

  @ApiProperty({ description: 'stuck 상태의 대기 중 이벤트 수' })
  stuckPending: number;

  @ApiProperty({ description: 'stuck 상태의 처리 중 이벤트 수' })
  stuckProcessing: number;
}

/**
 * 페이징 정보 DTO
 */
export class PaginationDto {
  @ApiProperty({ description: '조회 개수' })
  limit: number;

  @ApiProperty({ description: '시작 위치' })
  offset: number;

  @ApiProperty({ description: '다음 페이지 존재 여부' })
  hasMore: boolean;
}

/**
 * 동기화 이벤트 조회 응답 DTO
 */
export class SyncEventsResponseDto {
  @ApiProperty({
    description: '요약 정보',
    type: SyncEventsSummaryDto,
  })
  summary: SyncEventsSummaryDto;

  @ApiProperty({
    description: '이벤트 목록',
    type: [SyncEventDetailDto],
  })
  events: SyncEventDetailDto[];

  @ApiProperty({
    description: '페이징 정보',
    type: PaginationDto,
  })
  pagination: PaginationDto;

  @ApiProperty({ description: '조회 시각' })
  checkedAt: Date;
}
