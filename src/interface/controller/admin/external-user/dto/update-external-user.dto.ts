import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 외부 사용자 정보 수정 요청 DTO
 */
export class UpdateExternalUserRequestDto {
  @ApiProperty({
    description: '실명',
    example: '김철수',
    required: false,
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '이름은 1자 이상이어야 합니다.' })
  @MaxLength(100, { message: '이름은 100자 이하이어야 합니다.' })
  name?: string;

  @ApiProperty({
    description: '이메일 주소',
    example: 'kim@partner.com',
    required: false,
    format: 'email',
  })
  @IsOptional()
  @IsEmail({}, { message: '올바른 이메일 형식을 입력해주세요.' })
  email?: string;

  @ApiProperty({
    description: '소속 회사명',
    example: '협력사B',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '회사명은 100자 이하이어야 합니다.' })
  company?: string;

  @ApiProperty({
    description: '연락처',
    example: '010-9876-5432',
    required: false,
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '연락처는 20자 이하이어야 합니다.' })
  phone?: string;
}
