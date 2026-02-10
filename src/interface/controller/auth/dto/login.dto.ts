import { IsString, IsNotEmpty, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 로그인 요청 DTO
 */
export class LoginRequestDto {
    @ApiProperty({
        description: '이메일',
        example: 'seo.woohyeok@lumir.space',
    })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({
        description: '비밀번호',
        example: 'password123',
    })
    @IsString()
    @IsNotEmpty()
    password: string;
}

/**
 * 로그인 응답 DTO
 */
export class LoginResponseDto {
    @ApiProperty({ description: '성공 여부' })
    success: boolean;

    @ApiProperty({ description: 'JWT 토큰' })
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

    @ApiProperty({ description: 'SSO 토큰 정보' })
    ssoToken?: {
        accessToken: string;
        refreshToken?: string;
    };
}
