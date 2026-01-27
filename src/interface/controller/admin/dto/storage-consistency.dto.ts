/**
 * Storage Consistency 검증 DTOs
 * 스토리지 일관성 검증 API를 위한 DTO 정의
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { StorageType } from '../../../../domain/storage/file/file-storage-object.entity';

/**
 * 스토리지 일관성 검증 Query DTO
 */
export class StorageConsistencyQueryDto {
  @ApiPropertyOptional({
    enum: StorageType,
    description: '스토리지 타입 (미지정 시 전체)',
    example: 'CACHE',
  })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType;

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

  @ApiPropertyOptional({
    description: '샘플링 조회 여부 (true: 랜덤 샘플링)',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  sample?: boolean = false;
}

/**
 * 일관성 이슈 상세 정보
 */
export class StorageObjectDetailDto {
  @ApiProperty({ description: '스토리지 객체 ID' })
  id: string;

  @ApiProperty({ description: '스토리지 경로' })
  objectKey: string;

  @ApiProperty({ description: '가용성 상태' })
  availabilityStatus: string;
}

/**
 * 일관성 이슈 DTO
 */
export class ConsistencyIssueDto {
  @ApiProperty({ description: '파일 ID' })
  fileId: string;

  @ApiProperty({ description: '파일명' })
  fileName: string;

  @ApiProperty({
    description: '이슈 타입',
    enum: ['DB_ONLY', 'ORPHAN', 'SIZE_MISMATCH', 'ERROR'],
  })
  issueType: 'DB_ONLY' | 'ORPHAN' | 'SIZE_MISMATCH' | 'ERROR';

  @ApiProperty({ enum: StorageType, description: '스토리지 타입' })
  storageType: StorageType;

  @ApiProperty({ description: '설명' })
  description: string;

  @ApiPropertyOptional({ type: StorageObjectDetailDto })
  storageObject?: StorageObjectDetailDto;

  @ApiPropertyOptional({ description: 'DB에 기록된 파일 크기 (bytes)' })
  dbSize?: number;

  @ApiPropertyOptional({ description: '실제 파일 크기 (bytes)' })
  actualSize?: number;
}

/**
 * 스토리지 일관성 검증 결과 DTO
 */
export class StorageConsistencyResponseDto {
  @ApiProperty({ description: '검증한 총 파일 수' })
  totalChecked: number;

  @ApiProperty({ description: '불일치 개수' })
  inconsistencies: number;

  @ApiProperty({
    description: '발견된 이슈 목록',
    type: [ConsistencyIssueDto],
  })
  issues: ConsistencyIssueDto[];

  @ApiProperty({ description: '검증 시각' })
  checkedAt: Date;
}
