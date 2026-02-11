import { IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FileActionRequestStatus } from '../../../../../domain/file-action-request/enums/file-action-request-status.enum';
import { FileActionType } from '../../../../../domain/file-action-request/enums/file-action-type.enum';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';

/**
 * 관리자 파일 작업 요청 목록 조회 쿼리 DTO
 */
export class FileActionRequestAdminQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: '요청 상태 필터',
    enum: FileActionRequestStatus,
  })
  @IsOptional()
  @IsEnum(FileActionRequestStatus, { message: '올바른 요청 상태가 아닙니다.' })
  status?: FileActionRequestStatus;

  @ApiPropertyOptional({
    description: '요청 타입 필터',
    enum: FileActionType,
  })
  @IsOptional()
  @IsEnum(FileActionType, { message: '올바른 요청 타입이 아닙니다.' })
  type?: FileActionType;

  @ApiPropertyOptional({
    description: '요청자 ID 필터',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: '올바른 사용자 ID 형식이 아닙니다.' })
  requesterId?: string;

  @ApiPropertyOptional({
    description: '파일 ID 필터',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: '올바른 파일 ID 형식이 아닙니다.' })
  fileId?: string;

  @ApiPropertyOptional({
    description: '요청일 시작',
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '올바른 날짜 형식이 아닙니다. (ISO 8601)' })
  requestedFrom?: string;

  @ApiPropertyOptional({
    description: '요청일 종료',
    example: '2026-02-28T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: '올바른 날짜 형식이 아닙니다. (ISO 8601)' })
  requestedTo?: string;
}
