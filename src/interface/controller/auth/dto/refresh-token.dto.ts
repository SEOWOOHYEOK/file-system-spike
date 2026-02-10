import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 토큰 갱신 요청 DTO
 */
export class RefreshTokenRequestDto {
    @ApiProperty({
        description: 'SSO 리프레시 토큰',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
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

    @ApiProperty({ description: '새로운 JWT 토큰' })
    token: string;

    @ApiProperty({ description: '사용자 정보' })
    user: {
        id: string;
        employeeNumber: string;
        name?: string;
        email?: string;
    };

    @ApiProperty({ description: '사용자 타입 (내부/외부)', enum: ['internal', 'external'] })
    userType: 'internal' | 'external';

    // @ApiProperty({ description: '새로운 SSO 토큰 정보' })
    // ssoToken: {
    //     accessToken: string;
    //     refreshToken?: string;
    // };
}
