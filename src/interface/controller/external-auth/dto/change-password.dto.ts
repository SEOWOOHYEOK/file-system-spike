import { IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 비밀번호 변경 요청 DTO
 */
export class ChangePasswordRequestDto {
  @ApiProperty({
    description: '현재 비밀번호',
    example: 'OldPass123!',
  })
  @IsString()
  @IsNotEmpty({ message: '현재 비밀번호를 입력해주세요.' })
  currentPassword: string;

  @ApiProperty({
    description: '새 비밀번호 (최소 8자, 대소문자 및 숫자 포함)',
    example: 'NewSecurePass456!',
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: '새 비밀번호를 입력해주세요.' })
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  @MaxLength(100, { message: '비밀번호는 100자 이하이어야 합니다.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '비밀번호는 대문자, 소문자, 숫자를 각각 하나 이상 포함해야 합니다.',
  })
  newPassword: string;
}

/**
 * 비밀번호 변경 응답 DTO
 */
export class ChangePasswordResponseDto {
  @ApiProperty({
    description: '결과 메시지',
    example: 'Password changed successfully. Please login again.',
  })
  message: string;
}
