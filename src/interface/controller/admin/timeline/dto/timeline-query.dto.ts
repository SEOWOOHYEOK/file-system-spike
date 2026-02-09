import { IsOptional, IsEnum, IsString, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EventSource } from '../../../../../domain/audit/enums/event-source.enum';

/**
 * 시간 범위 통합 타임라인 조회 쿼리 DTO
 */
export class TimelineTimeRangeQueryDto {
  @ApiProperty({
    description: '조회 시작 시간 (ISO 8601 date-time)',
    required: true,
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsDateString({}, { message: '시작 시간은 올바른 날짜 형식이어야 합니다.' })
  from: string;

  @ApiProperty({
    description: '조회 종료 시간 (ISO 8601 date-time)',
    required: true,
    example: '2026-02-28T23:59:59.999Z',
  })
  @IsDateString({}, { message: '종료 시간은 올바른 날짜 형식이어야 합니다.' })
  to: string;

  @ApiProperty({
    description: '이벤트 소스 필터',
    enum: EventSource,
    isArray: true,
    required: false,
    example: [EventSource.AUDIT, EventSource.FILE_CHANGE],
  })
  @IsOptional()
  @IsEnum(EventSource, { each: true, message: '올바른 이벤트 소스가 아닙니다.' })
  eventSources?: EventSource[];

  @ApiProperty({
    description: '심각도 필터',
    required: false,
    example: 'HIGH',
  })
  @IsOptional()
  @IsString({ message: '심각도는 문자열이어야 합니다.' })
  severity?: string;

  @ApiProperty({
    description: '결과 필터',
    enum: ['SUCCESS', 'FAILURE'],
    required: false,
    example: 'SUCCESS',
  })
  @IsOptional()
  @IsEnum(['SUCCESS', 'FAILURE'], { message: '결과는 SUCCESS 또는 FAILURE여야 합니다.' })
  result?: 'SUCCESS' | 'FAILURE';

  @ApiProperty({
    description: '에러 코드 필터',
    required: false,
    example: 'FILE_NOT_FOUND',
  })
  @IsOptional()
  @IsString({ message: '에러 코드는 문자열이어야 합니다.' })
  errorCode?: string;

  @ApiProperty({
    description: '페이지 번호',
    example: 1,
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 번호는 정수여야 합니다.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 합니다.' })
  page?: number = 1;

  @ApiProperty({
    description: '페이지 크기',
    example: 20,
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 크기는 정수여야 합니다.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 합니다.' })
  @Max(100, { message: '페이지 크기는 100 이하이어야 합니다.' })
  size?: number = 20;
}

/**
 * 파일 중심 타임라인 조회 쿼리 DTO
 */
export class TimelineFileQueryDto {
  @ApiProperty({
    description: '조회 시작 시간 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '시작 시간은 올바른 날짜 형식이어야 합니다.' })
  from?: string;

  @ApiProperty({
    description: '조회 종료 시간 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-28T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '종료 시간은 올바른 날짜 형식이어야 합니다.' })
  to?: string;

  @ApiProperty({
    description: '페이지 번호',
    example: 1,
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 번호는 정수여야 합니다.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 합니다.' })
  page?: number = 1;

  @ApiProperty({
    description: '페이지 크기',
    example: 20,
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 크기는 정수여야 합니다.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 합니다.' })
  @Max(100, { message: '페이지 크기는 100 이하이어야 합니다.' })
  size?: number = 20;
}

/**
 * 사용자 중심 타임라인 조회 쿼리 DTO
 */
export class TimelineActorQueryDto {
  @ApiProperty({
    description: '조회 시작 시간 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '시작 시간은 올바른 날짜 형식이어야 합니다.' })
  from?: string;

  @ApiProperty({
    description: '조회 종료 시간 (ISO 8601 date-time)',
    required: false,
    example: '2026-02-28T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '종료 시간은 올바른 날짜 형식이어야 합니다.' })
  to?: string;

  @ApiProperty({
    description: '페이지 번호',
    example: 1,
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 번호는 정수여야 합니다.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 합니다.' })
  page?: number = 1;

  @ApiProperty({
    description: '페이지 크기',
    example: 20,
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 크기는 정수여야 합니다.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 합니다.' })
  @Max(100, { message: '페이지 크기는 100 이하이어야 합니다.' })
  size?: number = 20;
}
