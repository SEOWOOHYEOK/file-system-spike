import { ApiProperty } from '@nestjs/swagger';
import { ExternalUser } from '../../../../domain/external-share/entities/external-user.entity';

/**
 * 외부 사용자 목록 아이템 DTO
 * 공유 생성 시 외부 사용자 선택용
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
