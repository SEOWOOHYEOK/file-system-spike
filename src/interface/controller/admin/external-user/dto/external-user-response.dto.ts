import { ApiProperty } from '@nestjs/swagger';
import { ExternalUser } from '../../../../../domain/external-share/entities/external-user.entity';

/**
 * 외부 사용자 응답 DTO
 */
export class ExternalUserResponseDto {
  @ApiProperty({ description: '사용자 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '로그인용 사용자명', example: 'partner_user01' })
  username: string;

  @ApiProperty({ description: '실명', example: '홍길동' })
  name: string;

  @ApiProperty({ description: '이메일', example: 'hong@partner.com' })
  email: string;

  @ApiProperty({ description: '소속 회사', example: '협력사A', required: false })
  company?: string;

  @ApiProperty({ description: '연락처', example: '010-1234-5678', required: false })
  phone?: string;

  @ApiProperty({ description: '활성화 상태', example: true })
  isActive: boolean;

  @ApiProperty({ description: '생성자 ID', format: 'uuid' })
  createdBy: string;

  @ApiProperty({ description: '생성일시', format: 'date-time' })
  createdAt: Date;

  /**
   * ExternalUser 엔티티를 Response DTO로 변환
   * passwordHash는 응답에서 제외됨
   */
  static fromEntity(entity: ExternalUser): ExternalUserResponseDto {
    const dto = new ExternalUserResponseDto();
    dto.id = entity.id;
    dto.username = entity.username;
    dto.name = entity.name;
    dto.email = entity.email;
    dto.company = entity.company;
    dto.phone = entity.phone;
    dto.isActive = entity.isActive;
    dto.createdBy = entity.createdBy;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/**
 * 외부 사용자 목록 아이템 DTO
 */
export class ExternalUserListItemDto {
  @ApiProperty({ description: '사용자 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '로그인용 사용자명', example: 'partner_user01' })
  username: string;

  @ApiProperty({ description: '실명', example: '홍길동' })
  name: string;

  @ApiProperty({ description: '이메일', example: 'hong@partner.com' })
  email: string;

  @ApiProperty({ description: '소속 회사', example: '협력사A', required: false })
  company?: string;

  @ApiProperty({ description: '연락처', example: '010-1234-5678', required: false })
  phone?: string;

  @ApiProperty({ description: '활성화 상태', example: true })
  isActive: boolean;

  @ApiProperty({ description: '생성일시', format: 'date-time' })
  createdAt: Date;

  /**
   * ExternalUser 엔티티를 목록 아이템 DTO로 변환
   */
  static fromEntity(entity: ExternalUser): ExternalUserListItemDto {
    const dto = new ExternalUserListItemDto();
    dto.id = entity.id;
    dto.username = entity.username;
    dto.name = entity.name;
    dto.email = entity.email;
    dto.company = entity.company;
    dto.phone = entity.phone;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/**
 * 계정 활성화/비활성화 응답 DTO
 */
export class ExternalUserStatusResponseDto {
  @ApiProperty({ description: '사용자 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '로그인용 사용자명', example: 'partner_user01' })
  username: string;

  @ApiProperty({ description: '활성화 상태', example: true })
  isActive: boolean;

  /**
   * ExternalUser 엔티티를 상태 응답 DTO로 변환
   */
  static fromEntity(entity: ExternalUser): ExternalUserStatusResponseDto {
    const dto = new ExternalUserStatusResponseDto();
    dto.id = entity.id;
    dto.username = entity.username;
    dto.isActive = entity.isActive;
    return dto;
  }
}

/**
 * 비밀번호 초기화 응답 DTO
 */
export class ResetPasswordResponseDto {
  @ApiProperty({
    description: '임시 비밀번호 (12자리)',
    example: 'Ab3!xY9@kL2m',
  })
  temporaryPassword: string;
}
