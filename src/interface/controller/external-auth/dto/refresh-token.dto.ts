import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Refresh Token 요청 DTO
 */
export class ExternalRefreshTokenRequestDto {
  @ApiProperty({
    description: '로그인 시 발급받은 Refresh Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh Token을 입력해주세요.' })
  refreshToken: string;
}

/**
 * Refresh Token 응답 DTO
 */
export class ExternalRefreshTokenResponseDto {
  @ApiProperty({
    description: '새 Access Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Access Token 만료 시간 (초)',
    example: 900,
  })
  expiresIn: number;
}

/**
 * 로그아웃 응답 DTO
 */
export class ExternalLogoutResponseDto {
  @ApiProperty({
    description: '결과 메시지',
    example: 'Logged out successfully',
  })
  message: string;
}
