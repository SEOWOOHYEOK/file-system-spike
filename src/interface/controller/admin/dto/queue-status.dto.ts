/**
 * 큐 상태 조회 DTO
 */
import { ApiProperty } from '@nestjs/swagger';

/**
 * 개별 큐 상태 DTO
 */
export class QueueInfoDto {
  @ApiProperty({
    description: '큐 이름',
    example: 'NAS_FILE_SYNC',
  })
  name: string;

  @ApiProperty({
    description: '대기 중인 작업 수',
    example: 1234,
  })
  waiting: number;

  @ApiProperty({
    description: '처리 중인 작업 수',
    example: 5,
  })
  active: number;

  @ApiProperty({
    description: '완료된 작업 수',
    example: 45678,
  })
  completed: number;

  @ApiProperty({
    description: '실패한 작업 수',
    example: 12,
  })
  failed: number;

  @ApiProperty({
    description: '지연된 작업 수',
    example: 3,
  })
  delayed: number;
}

/**
 * 큐 상태 요약 DTO
 */
export class QueueSummaryDto {
  @ApiProperty({
    description: '전체 대기 중 작업 수',
    example: 1500,
  })
  totalWaiting: number;

  @ApiProperty({
    description: '전체 처리 중 작업 수',
    example: 15,
  })
  totalActive: number;

  @ApiProperty({
    description: '전체 실패한 작업 수',
    example: 20,
  })
  totalFailed: number;
}

/**
 * 큐 상태 조회 응답 DTO
 */
export class QueueStatusResponseDto {
  @ApiProperty({
    description: '큐별 상태 정보',
    type: [QueueInfoDto],
  })
  queues: QueueInfoDto[];

  @ApiProperty({
    description: '전체 요약 정보',
    type: QueueSummaryDto,
  })
  summary: QueueSummaryDto;

  @ApiProperty({
    description: '조회 시각',
    example: '2026-02-02T10:00:00.000Z',
  })
  checkedAt: Date;
}
