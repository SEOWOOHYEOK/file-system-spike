import { IsOptional, IsInt, IsString, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 페이지네이션 쿼리 DTO
 */
export class PaginationQueryDto {
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
  page: number = 1;

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
  pageSize: number = 20;

  @ApiProperty({
    description: '정렬 기준 필드',
    example: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '정렬 기준은 문자열이어야 합니다.' })
  sortBy?: string;

  @ApiProperty({
    description: '정렬 순서',
    enum: ['asc', 'desc'],
    required: false,
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: '정렬 순서는 asc 또는 desc여야 합니다.' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * 페이지네이션 응답 메타 DTO
 */
export class PaginationMetaDto {
  @ApiProperty({ description: '현재 페이지', example: 1 })
  page: number;

  @ApiProperty({ description: '페이지 크기', example: 20 })
  pageSize: number;

  @ApiProperty({ description: '전체 아이템 수', example: 50 })
  totalItems: number;

  @ApiProperty({ description: '전체 페이지 수', example: 3 })
  totalPages: number;

  @ApiProperty({ description: '다음 페이지 존재 여부', example: true })
  hasNext: boolean;

  @ApiProperty({ description: '이전 페이지 존재 여부', example: false })
  hasPrev: boolean;
}

/**
 * 페이지네이션 응답 래퍼 (제네릭)
 */
export class PaginatedResponseDto<T> {
  items: T[];

  @ApiProperty({ description: '현재 페이지', example: 1 })
  page: number;

  @ApiProperty({ description: '페이지 크기', example: 20 })
  pageSize: number;

  @ApiProperty({ description: '전체 아이템 수', example: 50 })
  totalItems: number;

  @ApiProperty({ description: '전체 페이지 수', example: 3 })
  totalPages: number;

  @ApiProperty({ description: '다음 페이지 존재 여부', example: true })
  hasNext: boolean;

  @ApiProperty({ description: '이전 페이지 존재 여부', example: false })
  hasPrev: boolean;
}

