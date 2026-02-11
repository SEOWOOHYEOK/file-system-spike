import { IsOptional, IsEnum, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ShareRequestStatus } from '../../../../domain/share-request/type/share-request-status.enum';

/**
 * 내가 보낸 공유 상태 필터
 * - ShareRequest: PENDING, APPROVED, REJECTED, CANCELED
 * - PublicShare: ACTIVE, REVOKED
 */
export const MY_SENT_SHARE_STATUS = {
  ...ShareRequestStatus,
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;

export type MySentShareStatus =
  | ShareRequestStatus
  | (typeof MY_SENT_SHARE_STATUS)['ACTIVE']
  | (typeof MY_SENT_SHARE_STATUS)['REVOKED'];

const ALL_STATUSES: string[] = [
  ShareRequestStatus.PENDING,
  ShareRequestStatus.APPROVED,
  ShareRequestStatus.REJECTED,
  ShareRequestStatus.CANCELED,
  'ACTIVE',
  'REVOKED',
];

/**
 * 내가 보낸 공유 통합 목록 조회 쿼리 DTO
 */
export class MySentShareQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '상태 필터 (ShareRequest: PENDING, APPROVED, REJECTED, CANCELED / PublicShare: ACTIVE, REVOKED)',
    enum: ALL_STATUSES,
    required: false,
    example: ShareRequestStatus.PENDING,
  })
  @IsOptional()
  @IsIn(ALL_STATUSES, { message: '올바른 상태가 아닙니다.' })
  status?: MySentShareStatus;
}
