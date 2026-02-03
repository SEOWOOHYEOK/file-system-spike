/**
 * 캐시 관리 API DTO
 */
import { ApiProperty } from '@nestjs/swagger';

/**
 * DB 기준 캐시 파일 통계
 */
export class CacheDbStatsDto {
  @ApiProperty({
    description: 'DB에 등록된 캐시 파일 총 수',
    example: 1234,
  })
  totalCount: number;

  @ApiProperty({
    description: '상태별 파일 수',
    example: { AVAILABLE: 1200, SYNCING: 20, EVICTING: 5, ERROR: 2, MISSING: 7 },
  })
  byStatus: Record<string, number>;

  @ApiProperty({
    description: '현재 다운로드 중인 파일 수 (leaseCount > 0)',
    example: 3,
  })
  leasedCount: number;

  @ApiProperty({
    description: 'NAS에 동기화되지 않은 파일 수',
    example: 25,
  })
  unsyncedToNasCount: number;

  @ApiProperty({
    description: 'Eviction 가능한 파일 수 (AVAILABLE + leaseCount=0 + NAS 동기화 완료)',
    example: 1100,
  })
  evictableCount: number;
}

/**
 * 디스크 실제 파일 통계
 */
export class CacheDiskStatsDto {
  @ApiProperty({
    description: '디스크에 존재하는 실제 파일 수',
    example: 1250,
  })
  fileCount: number;

  @ApiProperty({
    description: '디스크 실제 사용량 (bytes)',
    example: 5368709120,
  })
  totalBytes: number;

  @ApiProperty({
    description: '읽기 쉬운 디스크 사용량',
    example: '5.00 GB',
  })
  totalBytesFormatted: string;
}

/**
 * 캐시 사용 현황 응답 DTO
 */
export class CacheUsageResponseDto {
  @ApiProperty({
    description: '현재 캐시 사용량 (bytes)',
    example: 5368709120,
  })
  currentBytes: number;

  @ApiProperty({
    description: '최대 캐시 크기 (bytes)',
    example: 10737418240,
  })
  maxBytes: number;

  @ApiProperty({
    description: '캐시 사용률 (%)',
    example: 50.0,
  })
  usagePercent: number;

  @ApiProperty({
    description: 'Eviction 시작 임계값 (%)',
    example: 80,
  })
  thresholdPercent: number;

  @ApiProperty({
    description: 'Eviction 목표 (%)',
    example: 70,
  })
  targetPercent: number;

  @ApiProperty({
    description: '읽기 쉬운 현재 사용량',
    example: '5.00 GB',
  })
  currentBytesFormatted: string;

  @ApiProperty({
    description: '읽기 쉬운 최대 크기',
    example: '10.00 GB',
  })
  maxBytesFormatted: string;

  @ApiProperty({
    description: 'DB 기준 캐시 파일 통계',
    type: CacheDbStatsDto,
  })
  db: CacheDbStatsDto;

  @ApiProperty({
    description: '디스크 실제 파일 통계',
    type: CacheDiskStatsDto,
  })
  disk: CacheDiskStatsDto;

  @ApiProperty({
    description: '조회 시각',
    example: '2026-02-03T10:00:00.000Z',
  })
  checkedAt: Date;
}

/**
 * 수동 Eviction 응답 DTO
 */
export class CacheEvictionResponseDto {
  @ApiProperty({
    description: '제거된 파일 수',
    example: 50,
  })
  evictedCount: number;

  @ApiProperty({
    description: '해제된 공간 (bytes)',
    example: 536870912,
  })
  freedBytes: number;

  @ApiProperty({
    description: '읽기 쉬운 해제된 공간',
    example: '512.00 MB',
  })
  freedBytesFormatted: string;

  @ApiProperty({
    description: '건너뛴 파일 수 (lease 중 등)',
    example: 5,
  })
  skippedCount: number;

  @ApiProperty({
    description: '에러 발생 수',
    example: 0,
  })
  errorCount: number;

  @ApiProperty({
    description: '실행 시각',
    example: '2026-02-03T10:00:00.000Z',
  })
  executedAt: Date;
}
