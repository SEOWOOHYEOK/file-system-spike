/**
 * Observability 대시보드 API 응답 DTO
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// === 요청 DTO ===

export class ObservabilityHistoryQueryDto {
  @ApiPropertyOptional({ description: '조회할 시간 범위 (시간)', default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(168)
  hours?: number;
}

export class UpdateObservabilitySettingsDto {
  @ApiPropertyOptional({ description: '헬스체크 주기 (분)', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(60)
  intervalMinutes?: number;

  @ApiPropertyOptional({ description: '이력 보존 기간 (일)', example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @ApiPropertyOptional({ description: '스토리지 임계치 (%)', example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(99)
  thresholdPercent?: number;
}

// === 응답 DTO ===

export class ObservabilityCurrentDto {
  @ApiProperty({ description: '스토리지 상태', enum: ['healthy', 'degraded', 'unhealthy'] })
  status: string;

  @ApiProperty({ description: '응답 시간 (ms)' })
  responseTimeMs: number;

  @ApiProperty({ description: '확인 시각' })
  checkedAt: Date;

  @ApiPropertyOptional({ description: '전체 용량 (bytes)' })
  totalBytes?: number;

  @ApiPropertyOptional({ description: '사용 용량 (bytes)' })
  usedBytes?: number;

  @ApiPropertyOptional({ description: '여유 용량 (bytes)' })
  freeBytes?: number;

  @ApiPropertyOptional({ description: '사용률 (%)' })
  usagePercent?: number;

  @ApiPropertyOptional({ description: '서버명 (UNC 경로에서 추출)' })
  serverName?: string;

  @ApiPropertyOptional({ description: '에러 메시지' })
  error?: string;
}

export class ObservabilityHistoryItemDto {
  @ApiProperty({ description: '상태' })
  status: string;

  @ApiProperty({ description: '응답 시간 (ms)' })
  responseTimeMs: number;

  @ApiProperty({ description: '전체 용량 (bytes)' })
  totalBytes: number;

  @ApiProperty({ description: '사용 용량 (bytes)' })
  usedBytes: number;

  @ApiProperty({ description: '체크 시각' })
  checkedAt: Date;
}

export class ObservabilityHistoryResponseDto {
  @ApiProperty({ description: '이력 데이터', type: [ObservabilityHistoryItemDto] })
  items: ObservabilityHistoryItemDto[];

  @ApiProperty({ description: '조회 기간 (시간)' })
  hours: number;

  @ApiProperty({ description: '전체 건수' })
  totalCount: number;

  @ApiProperty({ description: '정상 비율 (%)' })
  healthyPercent: number;

  @ApiProperty({ description: '정상 시간' })
  healthyHours: number;

  @ApiProperty({ description: '비정상 시간' })
  unhealthyHours: number;
}

export class ObservabilitySettingsResponseDto {
  @ApiProperty({ description: '헬스체크 주기 (분)' })
  intervalMinutes: number;

  @ApiProperty({ description: '이력 보존 기간 (일)' })
  retentionDays: number;

  @ApiProperty({ description: '스토리지 임계치 (%)' })
  thresholdPercent: number;
}
