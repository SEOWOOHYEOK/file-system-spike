import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto';

/**
 * 관리자 공유 목록 필터 쿼리 DTO
 *
 * 페이지네이션 + 필터 조건 (공유자, 공유받은 사람, 파일명)
 */
export class AdminShareFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: '공유자 이름 (부분 일치)',
    example: '홍길동',
  })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({
    description: '공유자 부서 (부분 일치)',
    example: '개발팀',
  })
  @IsOptional()
  @IsString()
  ownerDepartment?: string;

  @ApiPropertyOptional({
    description: '공유받은 사람 이름 (부분 일치)',
    example: '김철수',
  })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({
    description: '공유받은 사람 부서 (부분 일치)',
    example: '협력업체A',
  })
  @IsOptional()
  @IsString()
  recipientDepartment?: string;

  @ApiPropertyOptional({
    description: '파일명 (부분 일치)',
    example: '설계문서',
  })
  @IsOptional()
  @IsString()
  fileName?: string;
}
