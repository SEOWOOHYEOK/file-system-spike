import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 파일 작업 요청 일괄 승인 DTO
 */
export class BulkApproveRequestDto {
  @ApiProperty({
    description: '승인할 요청 ID 목록',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
  })
  @IsArray({ message: '요청 ID는 배열 형식이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 요청을 선택해야 합니다.' })
  @IsUUID('4', { each: true, message: '올바른 요청 ID 형식이 아닙니다.' })
  ids: string[];

  @ApiPropertyOptional({
    description: '승인 코멘트',
    example: '일괄 승인합니다.',
  })
  @IsOptional()
  @IsString({ message: '코멘트는 문자열이어야 합니다.' })
  comment?: string;
}

/**
 * 파일 작업 요청 일괄 반려 DTO
 */
export class BulkRejectRequestDto {
  @ApiProperty({
    description: '반려할 요청 ID 목록',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
  })
  @IsArray({ message: '요청 ID는 배열 형식이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 요청을 선택해야 합니다.' })
  @IsUUID('4', { each: true, message: '올바른 요청 ID 형식이 아닙니다.' })
  ids: string[];

  @ApiProperty({
    description: '반려 사유 (필수)',
    example: '정책 변경으로 인해 일괄 반려합니다.',
  })
  @IsString({ message: '반려 사유는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '반려 사유를 입력해주세요.' })
  comment: string;
}
