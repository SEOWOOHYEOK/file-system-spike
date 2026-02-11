import { IsOptional, IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShareRequestStatus } from '../../../../domain/share-request/type/share-request-status.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * 받은 공유 요청 목록 조회 쿼리 DTO (R-2)
 */
export class ReceivedRequestQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '요청 상태 필터 (미지정 시 PENDING만 조회)',
    enum: ShareRequestStatus,
    required: false,
    default: ShareRequestStatus.PENDING,
    example: ShareRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ShareRequestStatus, { message: '올바른 요청 상태가 아닙니다.' })
  status?: ShareRequestStatus;
}

/**
 * 받은 공유 요청 승인 요청 DTO (R-4)
 */
export class ApproveReceivedRequestDto {
  @ApiProperty({
    description: '승인 코멘트',
    required: false,
    example: '승인합니다.',
  })
  @IsOptional()
  @IsString({ message: '승인 코멘트는 문자열이어야 합니다.' })
  comment?: string;
}

/**
 * 받은 공유 요청 반려 요청 DTO (R-5)
 */
export class RejectReceivedRequestDto {
  @ApiProperty({
    description: '반려 코멘트 (필수)',
    required: true,
    example: '보안 정책에 위배됩니다.',
  })
  @IsString({ message: '반려 코멘트는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '반려 코멘트는 필수입니다.' })
  comment: string;
}
