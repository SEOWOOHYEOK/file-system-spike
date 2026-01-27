/**
 * Health Check 응답 DTOs
 * 스토리지 연결 상태 확인 API 응답을 위한 DTO 정의
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * NAS 용량 정보 DTO
 */
export class NasCapacityDto {
  @ApiProperty({
    description: '총 용량 (bytes)',
    example: 1099511627776,
  })
  totalBytes: number;

  @ApiProperty({
    description: '사용 용량 (bytes)',
    example: 549755813888,
  })
  usedBytes: number;

  @ApiProperty({
    description: '여유 용량 (bytes)',
    example: 549755813888,
  })
  freeBytes: number;

  @ApiPropertyOptional({
    description: '매핑된 드라이브 문자',
    example: 'Z:',
  })
  drive?: string;

  @ApiPropertyOptional({
    description: 'UNC 경로',
    example: '\\\\192.168.10.249\\Web',
  })
  provider?: string;
}

/**
 * Cache Health Check 응답 DTO
 */
export class CacheHealthCheckResponseDto {
  @ApiProperty({
    description: '스토리지 상태',
    enum: ['healthy', 'degraded', 'unhealthy'],
    example: 'healthy',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: '응답 시간 (ms)',
    example: 15,
  })
  responseTimeMs: number;

  @ApiProperty({
    description: '확인 시각',
    example: '2026-01-27T10:00:00.000Z',
  })
  checkedAt: Date;

  @ApiPropertyOptional({
    description: '에러 메시지 (unhealthy 시)',
    example: 'Connection failed',
  })
  error?: string;
}

/**
 * NAS Health Check 응답 DTO
 */
export class NasHealthCheckResponseDto {
  @ApiProperty({
    description: '스토리지 상태',
    enum: ['healthy', 'degraded', 'unhealthy'],
    example: 'healthy',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: '응답 시간 (ms)',
    example: 45,
  })
  responseTimeMs: number;

  @ApiProperty({
    description: '확인 시각',
    example: '2026-01-27T10:00:00.000Z',
  })
  checkedAt: Date;

  @ApiPropertyOptional({
    description: 'NAS 용량 정보 (healthy 시)',
    type: NasCapacityDto,
  })
  capacity?: NasCapacityDto;

  @ApiPropertyOptional({
    description: '에러 메시지 (unhealthy 시)',
    example: 'No mapped drive found for UNC path',
  })
  error?: string;
}

/**
 * 개별 스토리지 건강 상태 DTO (하위호환용)
 * @deprecated 개별 API 사용 권장 (CacheHealthCheckResponseDto, NasHealthCheckResponseDto)
 */
export class StorageHealthDto {
  @ApiProperty({
    description: '스토리지 상태',
    enum: ['healthy', 'degraded', 'unhealthy'],
    example: 'healthy',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: '응답 시간 (ms)',
    example: 15,
  })
  responseTimeMs: number;

  @ApiProperty({
    description: '확인 시각',
    example: '2026-01-27T10:00:00.000Z',
  })
  checkedAt: Date;
}

/**
 * Health Check 응답 DTO (하위호환용)
 * @deprecated 개별 API 사용 권장
 */
export class HealthCheckResponseDto {
  @ApiProperty({
    description: '캐시 스토리지 상태',
    type: StorageHealthDto,
  })
  cache: StorageHealthDto;

  @ApiProperty({
    description: 'NAS 스토리지 상태',
    type: StorageHealthDto,
  })
  nas: StorageHealthDto;
}
