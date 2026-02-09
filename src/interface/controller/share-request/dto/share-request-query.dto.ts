import { IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShareRequestStatus } from '../../../../domain/share-request/type/share-request-status.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * 내 공유 요청 목록 조회 쿼리 DTO
 */
export class MyShareRequestsQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '요청 상태 필터',
    enum: ShareRequestStatus,
    required: false,
    example: ShareRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ShareRequestStatus, { message: '올바른 요청 상태가 아닙니다.' })
  status?: ShareRequestStatus;
}
