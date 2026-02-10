import { IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../../../domain/sync-event/entities/sync-event.entity';

export class SyncDashboardEventsQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '동기화 상태 필터',
    enum: SyncEventStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(SyncEventStatus, { message: '유효한 동기화 상태를 입력하세요.' })
  status?: SyncEventStatus;

  @ApiProperty({
    description: '이벤트 타입 필터',
    enum: SyncEventType,
    required: false,
  })
  @IsOptional()
  @IsEnum(SyncEventType, { message: '유효한 이벤트 타입을 입력하세요.' })
  eventType?: SyncEventType;

  @ApiProperty({
    description: '대상 타입 필터',
    enum: SyncEventTargetType,
    required: false,
  })
  @IsOptional()
  @IsEnum(SyncEventTargetType, { message: '유효한 대상 타입을 입력하세요.' })
  targetType?: SyncEventTargetType;

  @ApiProperty({
    description: '사용자 ID 필터',
    required: false,
  })
  @IsOptional()
  @IsUUID('4', { message: '유효한 UUID를 입력하세요.' })
  userId?: string;

  @ApiProperty({
    description: '시작 날짜 (YYYY-MM-DD)',
    required: false,
    example: '2026-02-09',
  })
  @IsOptional()
  @IsDateString({}, { message: '유효한 날짜 형식(YYYY-MM-DD)을 입력하세요.' })
  fromDate?: string;

  @ApiProperty({
    description: '종료 날짜 (YYYY-MM-DD)',
    required: false,
    example: '2026-02-10',
  })
  @IsOptional()
  @IsDateString({}, { message: '유효한 날짜 형식(YYYY-MM-DD)을 입력하세요.' })
  toDate?: string;
}
