import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 외부 사용자 로그인 요청 DTO
 */
export class ExternalLoginRequestDto {
  @ApiProperty({
    description: '외부 사용자 아이디',
    example: 'partner_user01',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: '아이디를 입력해주세요.' })
  @MinLength(3, { message: '아이디는 3자 이상이어야 합니다.' })
  @MaxLength(50, { message: '아이디는 50자 이하이어야 합니다.' })
  username: string;

  @ApiProperty({
    description: '비밀번호',
    example: 'SecurePass123!',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해주세요.' })
  @MinLength(6, { message: '비밀번호는 6자 이상이어야 합니다.' })
  password: string;
}

/**
 * 외부 사용자 로그인 응답 - 사용자 정보
 */
export class ExternalLoginUserDto {
  @ApiProperty({ description: '사용자 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '사용자명', example: 'partner_user01' })
  username: string;

  @ApiProperty({ description: '실명', example: '홍길동' })
  name: string;

  @ApiProperty({ description: '이메일', example: 'hong@partner.com' })
  email: string;

  @ApiProperty({ description: '소속 회사', example: '협력사A', required: false })
  company?: string;
}

/**
 * 외부 사용자 로그인 응답 DTO
 */
export class ExternalLoginResponseDto {
  @ApiProperty({
    description: 'Access Token (15분 유효)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh Token (7일 유효)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;


  @ApiProperty({ description: '사용자 정보', type: ExternalLoginUserDto })
  user: ExternalLoginUserDto;
}
