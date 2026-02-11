import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FileActionRequestStatus } from '../../../../domain/file-action-request/enums/file-action-request-status.enum';
import { FileActionType } from '../../../../domain/file-action-request/enums/file-action-type.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * 파일 작업 요청 목록 조회 쿼리 DTO
 */
export class FileActionRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: '요청 상태 필터',
    enum: FileActionRequestStatus,
    example: FileActionRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(FileActionRequestStatus, { message: '올바른 요청 상태가 아닙니다.' })
  status?: FileActionRequestStatus;

  @ApiPropertyOptional({
    description: '요청 타입 필터',
    enum: FileActionType,
    example: FileActionType.MOVE,
  })
  @IsOptional()
  @IsEnum(FileActionType, { message: '올바른 요청 타입이 아닙니다.' })
  type?: FileActionType;
}
