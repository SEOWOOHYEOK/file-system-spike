import { IsString, IsNotEmpty, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RoleNameEnum } from '../../../../domain/role/role-name.enum';

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

    @ApiProperty({ description: 'JWT 액세스 토큰' })
    accessToken: string;

    @ApiProperty({ description: '리프레시 토큰 (opaque)' })
    refreshToken: string;

    @ApiProperty({
        description: 'JWT 토큰 (accessToken과 동일, 하위 호환용)',
        deprecated: true,
    })
    token: string;

    @ApiProperty({ description: '사용자 정보' })
    user: {
        id: string;
        employeeNumber: string;
        name?: string;
        email?: string;
        userType: 'internal' | 'external';
        role: RoleNameEnum;
        roleDescription?: string;
    };

    @ApiProperty({ description: '액세스 토큰 만료 시간 (초)' })
    expiresIn: number;
}
