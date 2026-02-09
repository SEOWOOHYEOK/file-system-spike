import { ApiProperty } from '@nestjs/swagger';
import { EventSource } from '../../../../../domain/audit/enums/event-source.enum';
import type { ObservabilityEventDto, UnifiedTimeline } from '../../../../../business/audit/types/unified-timeline.types';

/**
 * 관찰 가능성 이벤트 응답 DTO
 */
export class ObservabilityEventResponseDto implements ObservabilityEventDto {
  @ApiProperty({ description: '이벤트 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '이벤트 소스', enum: EventSource })
  eventSource: EventSource;

  @ApiProperty({ description: '이벤트 타입' })
  eventType: string;

  @ApiProperty({ description: '발생 시간', format: 'date-time' })
  occurredAt: Date;

  @ApiProperty({ description: '요청 ID', required: false })
  requestId?: string;

  @ApiProperty({ description: '트레이스 ID', required: false })
  traceId?: string;

  @ApiProperty({ description: '부모 이벤트 ID', required: false })
  parentEventId?: string;

  @ApiProperty({ description: '행위자 ID' })
  actorId: string;

  @ApiProperty({ description: '행위자 이름', required: false })
  actorName?: string;

  @ApiProperty({ description: '대상 ID', required: false })
  targetId?: string;

  @ApiProperty({ description: '대상 이름', required: false })
  targetName?: string;

  @ApiProperty({ description: '결과', enum: ['SUCCESS', 'FAILURE'] })
  result: 'SUCCESS' | 'FAILURE';

  @ApiProperty({ description: '에러 코드', required: false })
  errorCode?: string;

  @ApiProperty({ description: '심각도', required: false })
  severity?: string;

  @ApiProperty({ description: '소요 시간 (밀리초)', required: false })
  durationMs?: number;

  @ApiProperty({ description: 'HTTP 메서드', required: false })
  httpMethod?: string;

  @ApiProperty({ description: 'API 엔드포인트', required: false })
  apiEndpoint?: string;

  @ApiProperty({ description: 'HTTP 응답 상태 코드', required: false })
  responseStatusCode?: number;

  @ApiProperty({ description: '시스템 액션', required: false })
  systemAction?: string;

  @ApiProperty({ description: '시스템 액션 상세', required: false })
  systemActionDetail?: string;

  @ApiProperty({ description: '후속 조치 예정 여부', required: false })
  followUpScheduled?: boolean;

  @ApiProperty({ description: '후속 조치 예정 시간', format: 'date-time', required: false })
  followUpAt?: Date;

  @ApiProperty({ description: '재시도 횟수', required: false })
  retryCount?: number;

  @ApiProperty({ description: '태그 목록', type: [String], required: false })
  tags?: string[];

  @ApiProperty({ description: '설명' })
  description: string;
}

/**
 * 통합 타임라인 응답 DTO
 */
export class UnifiedTimelineResponseDto {
  @ApiProperty({
    description: '이벤트 목록',
    type: [ObservabilityEventResponseDto],
  })
  events: ObservabilityEventResponseDto[];

  @ApiProperty({
    description: '요약 정보',
    example: {
      total: 100,
      bySource: {
        AUDIT: 50,
        FILE_CHANGE: 30,
        SYSTEM: 20,
      },
      byResult: {
        SUCCESS: 90,
        FAILURE: 10,
      },
      bySeverity: {
        HIGH: 5,
        MEDIUM: 10,
        LOW: 85,
      },
      timeRange: {
        earliest: '2026-02-01T00:00:00.000Z',
        latest: '2026-02-28T23:59:59.999Z',
      },
    },
  })
  summary: {
    total: number;
    bySource: Record<EventSource, number>;
    byResult: {
      SUCCESS: number;
      FAILURE: number;
    };
    bySeverity?: Record<string, number>;
    timeRange: {
      earliest: Date | null;
      latest: Date | null;
    };
  };

  @ApiProperty({
    description: '페이지네이션 정보',
    example: {
      current: 1,
      size: 20,
      totalElements: 100,
      totalPages: 5,
    },
  })
  page: {
    current: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };

  /**
   * UnifiedTimeline을 UnifiedTimelineResponseDto로 변환
   */
  static fromTimeline(timeline: UnifiedTimeline): UnifiedTimelineResponseDto {
    const dto = new UnifiedTimelineResponseDto();
    dto.events = timeline.events.map((event) => {
      const eventDto = new ObservabilityEventResponseDto();
      Object.assign(eventDto, event);
      return eventDto;
    });
    dto.summary = timeline.summary;
    dto.page = timeline.page;
    return dto;
  }
}
