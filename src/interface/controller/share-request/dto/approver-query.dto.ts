import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto';

/**
 * 승인자 검색 쿼리 DTO
 *
 * 매니저 이상 역할의 활성 사용자를 통합 키워드로 검색합니다.
 * keyword로 이름, 부서명, 이메일, 사번에 대해 OR 조건 검색을 수행합니다.
 */
export class ApproverQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      '통합 검색 키워드 (이름, 부서명, 이메일, 사번에서 OR 검색)',
    example: '김',
  })
  @IsOptional()
  @IsString({ message: '검색 키워드는 문자열이어야 합니다.' })
  keyword?: string;
}
