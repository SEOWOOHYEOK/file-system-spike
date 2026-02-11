import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 파일 작업 요청 승인 DTO
 */
export class ApproveRequestDto {
  @ApiPropertyOptional({
    description: '승인 코멘트',
    example: '확인했습니다. 승인합니다.',
  })
  @IsOptional()
  @IsString({ message: '코멘트는 문자열이어야 합니다.' })
  comment?: string;
}
