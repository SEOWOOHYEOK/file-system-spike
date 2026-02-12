import { IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * 내가 보낸 공유(PublicShare) 목록 조회 쿼리 DTO
 * PublicShare 상태만 허용: ACTIVE, REVOKED
 */
export class MySentShareQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '상태 필터 (ACTIVE, REVOKED)',
    enum: ['ACTIVE', 'REVOKED'],
    required: false,
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'REVOKED'], { message: '올바른 상태가 아닙니다.' })
  status?: 'ACTIVE' | 'REVOKED';
}
