import { ApiProperty } from '@nestjs/swagger';

export class SyncDashboardSummaryResponseDto {
  @ApiProperty({ description: '전체 이벤트 수', example: 150 })
  total: number;

  @ApiProperty({ description: 'PENDING 수', example: 10 })
  pending: number;

  @ApiProperty({ description: 'QUEUED 수', example: 5 })
  queued: number;

  @ApiProperty({ description: 'PROCESSING 수', example: 3 })
  processing: number;

  @ApiProperty({ description: 'RETRYING 수', example: 2 })
  retrying: number;

  @ApiProperty({ description: 'DONE 수', example: 120 })
  done: number;

  @ApiProperty({ description: 'FAILED 수', example: 10 })
  failed: number;

  @ApiProperty({ description: 'stuck 상태 수', example: 2 })
  stuckCount: number;

  @ApiProperty({ description: '조회 시각' })
  checkedAt: Date;

  static from(
    statusCounts: Record<string, number>,
    stuckCount: number,
    checkedAt: Date,
  ): SyncDashboardSummaryResponseDto {
    const dto = new SyncDashboardSummaryResponseDto();
    dto.pending = statusCounts['PENDING'] ?? 0;
    dto.queued = statusCounts['QUEUED'] ?? 0;
    dto.processing = statusCounts['PROCESSING'] ?? 0;
    dto.retrying = statusCounts['RETRYING'] ?? 0;
    dto.done = statusCounts['DONE'] ?? 0;
    dto.failed = statusCounts['FAILED'] ?? 0;
    dto.total = dto.pending + dto.queued + dto.processing + dto.retrying + dto.done + dto.failed;
    dto.stuckCount = stuckCount;
    dto.checkedAt = checkedAt;
    return dto;
  }
}
