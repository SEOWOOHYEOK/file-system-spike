import { ApiProperty } from '@nestjs/swagger';
import { PublicShare } from '../../../../domain/external-share/entities/public-share.entity';

/**
 * 공유 생성 응답 DTO
 */
export class PublicShareResponseDto {
  @ApiProperty({ description: '공유 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '파일 ID', format: 'uuid' })
  fileId: string;

  @ApiProperty({ description: '소유자 ID', format: 'uuid' })
  ownerId: string;

  @ApiProperty({ description: '외부 사용자 ID', format: 'uuid' })
  externalUserId: string;

  @ApiProperty({ description: '권한 목록', example: ['VIEW', 'DOWNLOAD'] })
  permissions: string[];

  @ApiProperty({ description: '최대 뷰 횟수', example: 10, required: false })
  maxViewCount?: number;

  @ApiProperty({ description: '현재 뷰 횟수', example: 0 })
  currentViewCount: number;

  @ApiProperty({ description: '최대 다운로드 횟수', example: 5, required: false })
  maxDownloadCount?: number;

  @ApiProperty({ description: '현재 다운로드 횟수', example: 0 })
  currentDownloadCount: number;

  @ApiProperty({ description: '만료일시', format: 'date-time', required: false })
  expiresAt?: Date;

  @ApiProperty({ description: '차단 여부', example: false })
  isBlocked: boolean;

  @ApiProperty({ description: '취소 여부', example: false })
  isRevoked: boolean;

  @ApiProperty({ description: '생성일시', format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시', format: 'date-time', required: false })
  updatedAt?: Date;

  @ApiProperty({ description: '차단일시', format: 'date-time', required: false })
  blockedAt?: Date;

  @ApiProperty({ description: '차단자 ID', format: 'uuid', required: false })
  blockedBy?: string;

  /**
   * PublicShare 엔티티를 Response DTO로 변환
   */
  static fromEntity(entity: PublicShare): PublicShareResponseDto {
    const dto = new PublicShareResponseDto();
    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.ownerId = entity.ownerId;
    dto.externalUserId = entity.externalUserId;
    dto.permissions = entity.permissions as string[];
    dto.maxViewCount = entity.maxViewCount;
    dto.currentViewCount = entity.currentViewCount;
    dto.maxDownloadCount = entity.maxDownloadCount;
    dto.currentDownloadCount = entity.currentDownloadCount;
    dto.expiresAt = entity.expiresAt;
    dto.isBlocked = entity.isBlocked;
    dto.isRevoked = entity.isRevoked;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.blockedAt = entity.blockedAt;
    dto.blockedBy = entity.blockedBy;
    return dto;
  }
}

/**
 * 공유 목록 아이템 DTO
 */
export class PublicShareListItemDto {
  @ApiProperty({ description: '공유 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '파일 ID', format: 'uuid' })
  fileId: string;

  @ApiProperty({ description: '외부 사용자 ID', format: 'uuid' })
  externalUserId: string;

  @ApiProperty({ description: '권한 목록', example: ['VIEW', 'DOWNLOAD'] })
  permissions: string[];

  @ApiProperty({ description: '현재 뷰 횟수', example: 3 })
  currentViewCount: number;

  @ApiProperty({ description: '현재 다운로드 횟수', example: 1 })
  currentDownloadCount: number;

  @ApiProperty({ description: '차단 여부', example: false })
  isBlocked: boolean;

  @ApiProperty({ description: '취소 여부', example: false })
  isRevoked: boolean;

  @ApiProperty({ description: '생성일시', format: 'date-time' })
  createdAt: Date;

  /**
   * PublicShare 엔티티를 목록 아이템 DTO로 변환
   */
  static fromEntity(entity: PublicShare): PublicShareListItemDto {
    const dto = new PublicShareListItemDto();
    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.externalUserId = entity.externalUserId;
    dto.permissions = entity.permissions as string[];
    dto.currentViewCount = entity.currentViewCount;
    dto.currentDownloadCount = entity.currentDownloadCount;
    dto.isBlocked = entity.isBlocked;
    dto.isRevoked = entity.isRevoked;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/**
 * 공유 취소 응답 DTO
 */
export class RevokeShareResponseDto {
  @ApiProperty({ description: '공유 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '취소 여부', example: true })
  isRevoked: boolean;

  /**
   * PublicShare 엔티티를 취소 응답 DTO로 변환
   */
  static fromEntity(entity: PublicShare): RevokeShareResponseDto {
    const dto = new RevokeShareResponseDto();
    dto.id = entity.id;
    dto.isRevoked = entity.isRevoked;
    return dto;
  }
}
