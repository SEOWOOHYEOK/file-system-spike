import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 진행률 상세 정보 DTO
 */
export class SyncProgressInfoDto {
  @ApiProperty({ description: '진행률 (0-100)', example: 45 })
  percent: number;

  @ApiPropertyOptional({ description: '완료된 청크 수', example: 9 })
  completedChunks?: number;

  @ApiPropertyOptional({ description: '전체 청크 수', example: 20 })
  totalChunks?: number;

  @ApiPropertyOptional({ description: '전송된 바이트', example: 94371840 })
  bytesTransferred?: number;

  @ApiPropertyOptional({ description: '전체 바이트', example: 209715200 })
  totalBytes?: number;
}

/**
 * 동기화 진행률 응답 DTO
 */
export class SyncProgressResponseDto {
  @ApiProperty({ description: '동기화 이벤트 ID' })
  syncEventId: string;

  @ApiPropertyOptional({ description: '파일 ID', nullable: true })
  fileId?: string | null;

  @ApiPropertyOptional({
    description: '이벤트 타입',
    enum: ['CREATE', 'MOVE', 'RENAME', 'TRASH', 'RESTORE', 'PURGE'],
  })
  eventType?: string;

  @ApiProperty({
    description: '상태',
    enum: ['IDLE', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED'],
  })
  status: string;

  @ApiPropertyOptional({ description: '진행률 정보', type: SyncProgressInfoDto })
  progress?: SyncProgressInfoDto;

  @ApiPropertyOptional({ description: '처리 시작 시간' })
  startedAt?: string;

  @ApiPropertyOptional({ description: '마지막 업데이트 시간' })
  updatedAt?: string;

  @ApiPropertyOptional({ description: '에러 메시지', nullable: true })
  errorMessage?: string | null;

  @ApiPropertyOptional({ description: '상태 메시지' })
  message?: string;
}
