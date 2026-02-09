import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 승인 요청 DTO (A-4)
 */
export class ApproveRequestDto {
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
 * 반려 요청 DTO (A-5)
 */
export class RejectRequestDto {
  @ApiProperty({
    description: '반려 코멘트',
    required: true,
    example: '보안 정책에 위배됩니다.',
  })
  @IsString({ message: '반려 코멘트는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '반려 코멘트는 필수입니다.' })
  comment: string;
}
