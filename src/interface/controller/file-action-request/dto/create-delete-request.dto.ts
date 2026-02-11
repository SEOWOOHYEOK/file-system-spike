import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 파일 삭제 요청 생성 DTO
 */
export class CreateDeleteRequestDto {
  @ApiProperty({
    description: '삭제할 파일 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: '올바른 파일 ID 형식이 아닙니다.' })
  @IsNotEmpty({ message: '파일 ID를 입력해주세요.' })
  fileId: string;

  @ApiProperty({
    description: '요청 사유',
    example: '더 이상 필요하지 않은 파일입니다.',
  })
  @IsString({ message: '사유는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '사유를 입력해주세요.' })
  reason: string;

  @ApiProperty({
    description: '승인 대상자 ID',
    example: '550e8400-e29b-41d4-a716-446655440003',
    format: 'uuid',
  })
  @IsUUID('4', { message: '올바른 승인 대상자 ID 형식이 아닙니다.' })
  @IsNotEmpty({ message: '승인 대상자를 선택해주세요.' })
  designatedApproverId: string;
}
