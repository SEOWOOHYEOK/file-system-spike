import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 토큰 검증 요청 DTO
 */
export class VerifyTokenRequestDto {
    @ApiProperty({
        description: '검증할 JWT 토큰',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    @IsString()
    @IsNotEmpty()
    token: string;
}

/**
 * 토큰 검증 응답 DTO
 */
export class VerifyTokenResponseDto {
    @ApiProperty({ description: '검증 성공 여부' })
    valid: boolean;

    @ApiProperty({ description: '토큰이 유효한 경우 payload 정보', required: false })
    payload?: {
        id?: string;
        employeeNumber: string;
        name?: string;
        email?: string;
        iat?: number;
        exp?: number;
        [key: string]: any;
    };

    @ApiProperty({ description: '검증 실패 시 오류 메시지', required: false })
    error?: string;

    @ApiProperty({ description: '토큰 만료 여부', required: false })
    expired?: boolean;
}
