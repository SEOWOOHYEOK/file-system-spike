import { IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ShareRequestStatus } from '../../../../domain/share-request/type/share-request-status.enum';

/**
 * 내가 보낸 결제 요청 목록 조회 쿼리 DTO
 * ShareRequest 상태만 허용: PENDING, APPROVED, REJECTED, CANCELED
 */
export class MySentShareRequestQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '상태 필터 (PENDING, APPROVED, REJECTED, CANCELED)',
    enum: ShareRequestStatus,
    required: false,
    example: ShareRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ShareRequestStatus, { message: '올바른 상태가 아닙니다.' })
  status?: ShareRequestStatus;
}
