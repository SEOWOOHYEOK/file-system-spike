import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 외부 사용자 생성 요청 DTO
 */
export class CreateExternalUserRequestDto {
  @ApiProperty({
    description: '로그인용 사용자명 (고유)',
    example: 'partner_user01',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: '사용자명을 입력해주세요.' })
  @MinLength(3, { message: '사용자명은 3자 이상이어야 합니다.' })
  @MaxLength(50, { message: '사용자명은 50자 이하이어야 합니다.' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '사용자명은 영문자, 숫자, 언더스코어만 사용할 수 있습니다.',
  })
  username: string;

  @ApiProperty({
    description: '비밀번호 (최소 8자, 대소문자 및 숫자 포함)',
    example: 'SecurePass123!',
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해주세요.' })
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  @MaxLength(100, { message: '비밀번호는 100자 이하이어야 합니다.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '비밀번호는 대문자, 소문자, 숫자를 각각 하나 이상 포함해야 합니다.',
  })
  password: string;

  @ApiProperty({
    description: '실명',
    example: '홍길동',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: '이름을 입력해주세요.' })
  @MinLength(1, { message: '이름은 1자 이상이어야 합니다.' })
  @MaxLength(100, { message: '이름은 100자 이하이어야 합니다.' })
  name: string;

  @ApiProperty({
    description: '이메일 주소',
    example: 'hong@partner.com',
    format: 'email',
  })
  @IsEmail({}, { message: '올바른 이메일 형식을 입력해주세요.' })
  @IsNotEmpty({ message: '이메일을 입력해주세요.' })
  email: string;

  @ApiProperty({
    description: '소속 회사명 (선택)',
    example: '협력사A',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '회사명은 100자 이하이어야 합니다.' })
  company?: string;

  @ApiProperty({
    description: '연락처 (선택)',
    example: '010-1234-5678',
    required: false,
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '연락처는 20자 이하이어야 합니다.' })
  phone?: string;
}
