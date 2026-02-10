import { ApiProperty } from '@nestjs/swagger';

/**
 * 로그아웃 응답 DTO
 */
export class LogoutResponseDto {
    @ApiProperty({
        description: '성공 여부',
        example: true,
    })
    success: boolean;

    @ApiProperty({
        description: '결과 메시지',
        example: '로그아웃되었습니다.',
    })
    message: string;
}
