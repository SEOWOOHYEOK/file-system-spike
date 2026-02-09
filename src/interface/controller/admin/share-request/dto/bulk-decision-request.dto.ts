import { IsArray, ArrayMinSize, IsUUID, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 일괄 승인 요청 DTO (A-6)
 */
export class BulkApproveRequestDto {
  @ApiProperty({
    description: '승인할 요청 ID 목록',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
  })
  @IsArray({ message: '요청 ID 목록은 배열이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 요청 ID가 필요합니다.' })
  @IsUUID('4', { each: true, message: '요청 ID는 올바른 UUID 형식이어야 합니다.' })
  ids: string[];

  @ApiProperty({
    description: '승인 코멘트',
    required: false,
    example: '일괄 승인합니다.',
  })
  @IsOptional()
  @IsString({ message: '승인 코멘트는 문자열이어야 합니다.' })
  comment?: string;
}

/**
 * 일괄 반려 요청 DTO (A-7)
 */
export class BulkRejectRequestDto {
  @ApiProperty({
    description: '반려할 요청 ID 목록',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
  })
  @IsArray({ message: '요청 ID 목록은 배열이어야 합니다.' })
  @ArrayMinSize(1, { message: '최소 1개 이상의 요청 ID가 필요합니다.' })
  @IsUUID('4', { each: true, message: '요청 ID는 올바른 UUID 형식이어야 합니다.' })
  ids: string[];

  @ApiProperty({
    description: '반려 코멘트',
    required: true,
    example: '보안 정책에 위배되어 일괄 반려합니다.',
  })
  @IsString({ message: '반려 코멘트는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '반려 코멘트는 필수입니다.' })
  comment: string;
}
