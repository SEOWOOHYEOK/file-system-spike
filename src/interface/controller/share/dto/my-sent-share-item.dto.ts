import { ApiProperty } from '@nestjs/swagger';
import { PublicShare } from '../../../../domain/external-share/entities/public-share.entity';
import { ShareRequest } from '../../../../domain/share-request/entities/share-request.entity';
import { ShareRequestStatus } from '../../../../domain/share-request/type/share-request-status.enum';

/**
 * 내가 보낸 공유 통합 목록 아이템 DTO
 * ShareRequest와 PublicShare를 통합하여 표현
 */
export class MySentShareItemDto {
  @ApiProperty({
    description: '항목 출처',
    enum: ['SHARE_REQUEST', 'PUBLIC_SHARE'],
    example: 'PUBLIC_SHARE',
  })
  source: 'SHARE_REQUEST' | 'PUBLIC_SHARE';

  @ApiProperty({ description: 'ID (ShareRequest 또는 PublicShare)', format: 'uuid' })
  id: string;

  @ApiProperty({
    description: '상태 (ShareRequest: PENDING/APPROVED/REJECTED/CANCELED, PublicShare: ACTIVE/REVOKED)',
    example: 'ACTIVE',
  })
  status: string;

  @ApiProperty({
    description: '파일 ID 목록 (ShareRequest는 다건, PublicShare는 단건)',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440001'],
  })
  fileIds: string[];

  @ApiProperty({
    description: '생성일시 (ShareRequest: requestedAt, PublicShare: createdAt)',
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: '소유자/요청자 ID',
    format: 'uuid',
  })
  ownerId: string;

  /**
   * ShareRequest 엔티티를 MySentShareItemDto로 변환
   */
  static fromShareRequest(entity: ShareRequest): MySentShareItemDto {
    const dto = new MySentShareItemDto();
    dto.source = 'SHARE_REQUEST';
    dto.id = entity.id;
    dto.status = entity.status;
    dto.fileIds = entity.fileIds;
    dto.createdAt = entity.requestedAt;
    dto.ownerId = entity.requesterId;
    return dto;
  }

  /**
   * PublicShare 엔티티를 MySentShareItemDto로 변환
   */
  static fromPublicShare(entity: PublicShare): MySentShareItemDto {
    const dto = new MySentShareItemDto();
    dto.source = 'PUBLIC_SHARE';
    dto.id = entity.id;
    dto.status = entity.isRevoked ? 'REVOKED' : 'ACTIVE';
    dto.fileIds = [entity.fileId];
    dto.createdAt = entity.createdAt;
    dto.ownerId = entity.ownerId;
    return dto;
  }
}
