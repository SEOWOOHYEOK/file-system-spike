import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 파일 작업 요청 반려 DTO
 */
export class RejectRequestDto {
  @ApiProperty({
    description: '반려 사유 (필수)',
    example: '사유가 불충분합니다. 추가 설명이 필요합니다.',
  })
  @IsString({ message: '반려 사유는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '반려 사유를 입력해주세요.' })
  comment: string;
}
