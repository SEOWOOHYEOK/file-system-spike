import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShareRequestStatus } from '../../../../../domain/share-request/type/share-request-status.enum';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';

/**
 * 그룹 목록 조회 쿼리 DTO (Q-3 파일별, Q-4 대상자별 공통)
 */
export class GroupListQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: '요청 상태 필터 (선택, 미지정 시 전체)',
    enum: ShareRequestStatus,
    required: false,
    example: ShareRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ShareRequestStatus, { message: '올바른 요청 상태가 아닙니다.' })
  status?: ShareRequestStatus;

  @ApiProperty({
    description: '검색어 (Q-3: 파일명, Q-4: 대상자 이름/이메일)',
    required: false,
    example: '보고서',
  })
  @IsOptional()
  @IsString({ message: '검색어는 문자열이어야 합니다.' })
  q?: string;
}
