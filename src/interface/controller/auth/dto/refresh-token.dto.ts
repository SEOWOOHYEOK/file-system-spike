import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 토큰 갱신 요청 DTO
 */
export class RefreshTokenRequestDto {
    @ApiProperty({
        description: 'DMS 리프레시 토큰',
        example: 'opaque-refresh-token-string',
    })
    @IsString()
    @IsNotEmpty()
    refreshToken: string;
}

/**
 * 토큰 갱신 응답 DTO
 */
export class RefreshTokenResponseDto {
    @ApiProperty({ description: '성공 여부' })
    success: boolean;

    @ApiProperty({ description: '새로운 JWT 액세스 토큰' })
    accessToken: string;

    @ApiProperty({ description: '새로운 리프레시 토큰 (로테이션)' })
    refreshToken: string;

    @ApiProperty({ description: '액세스 토큰 만료 시간 (초)' })
    expiresIn: number;
}
