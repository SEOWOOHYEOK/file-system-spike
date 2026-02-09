import { IsOptional, IsEnum, IsString, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ShareRequestStatus } from '../../../../../domain/share-request/type/share-request-status.enum';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';

/**
 * 공유 요청 목록 조회 쿼리 DTO (관리자용)
 */
export class ShareRequestAdminQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '요청 상태 필터',
    enum: ShareRequestStatus,
    required: true,
    example: ShareRequestStatus.PENDING,
  })
  @IsEnum(ShareRequestStatus, { message: '올바른 요청 상태가 아닙니다.' })
  status: ShareRequestStatus;

  @ApiProperty({
    description: '검색어 (파일명, 요청자명, 대상자명)',
    required: false,
    example: '문서',
  })
  @IsOptional()
  @IsString({ message: '검색어는 문자열이어야 합니다.' })
  q?: string;

  @ApiProperty({
    description: '요청자 ID 필터',
    required: false,
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID('4', { message: '요청자 ID는 올바른 UUID 형식이어야 합니다.' })
  requesterId?: string;

  @ApiProperty({
    description: '파일 ID 필터',
    required: false,
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID('4', { message: '파일 ID는 올바른 UUID 형식이어야 합니다.' })
  fileId?: string;

  @ApiProperty({
    description: '대상 사용자 ID 필터',
    required: false,
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsOptional()
  @IsUUID('4', { message: '대상 사용자 ID는 올바른 UUID 형식이어야 합니다.' })
  targetUserId?: string;

  @ApiProperty({
    description: '요청일 시작 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '요청일 시작은 올바른 날짜 형식이어야 합니다.' })
  requestedFrom?: string;

  @ApiProperty({
    description: '요청일 종료 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-28T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '요청일 종료는 올바른 날짜 형식이어야 합니다.' })
  requestedTo?: string;

  @ApiProperty({
    description: '공유 기간 시작 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-10T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '공유 기간 시작은 올바른 날짜 형식이어야 합니다.' })
  periodFrom?: string;

  @ApiProperty({
    description: '공유 기간 종료 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-20T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '공유 기간 종료는 올바른 날짜 형식이어야 합니다.' })
  periodTo?: string;

  @ApiProperty({
    description: '정렬 필드 및 방향 (예: "requestedAt,desc" 또는 "status,asc")',
    required: false,
    example: 'requestedAt,desc',
  })
  @IsOptional()
  @IsString({ message: '정렬은 문자열이어야 합니다.' })
  sort?: string;
}
