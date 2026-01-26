import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 토큰 생성 요청 DTO
 */
export class GenerateTokenRequestDto {
    @ApiProperty({
        description: '직원 번호',
        example: 'TEST001',
    })
    @IsString()
    @IsNotEmpty()
    employeeNumber: string;

    @ApiProperty({
        description: '이름',
        example: '테스트 사용자',
        required: false,
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({
        description: '이메일',
        example: 'test@example.com',
        required: false,
    })
    @IsString()
    @IsOptional()
    email?: string;

    @ApiProperty({
        description: '추가 payload 데이터 (JSON 형식)',
        example: { role: 'admin', department: 'IT' },
        required: false,
    })
    @IsOptional()
    additionalData?: Record<string, any>;
}

/**
 * 토큰 생성 응답 DTO
 */
export class GenerateTokenResponseDto {
    @ApiProperty({ description: '성공 여부' })
    success: boolean;

    @ApiProperty({ description: '생성된 JWT 토큰' })
    token: string;

    @ApiProperty({ description: '토큰 정보' })
    tokenInfo: {
        employeeNumber: string;
        name?: string;
        email?: string;
        issuedAt: Date;
        expiresAt?: Date;
    };

    @ApiProperty({ description: '사용 방법' })
    usage: string;
}
