import { ApiProperty } from '@nestjs/swagger';
import { PublicShare } from '../../../../../domain/external-share/entities/public-share.entity';

/**
 * 공유 차단/해제 응답 DTO
 */
export class ShareBlockResponseDto {
  @ApiProperty({ description: '공유 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '차단 여부', example: true })
  isBlocked: boolean;

  @ApiProperty({ description: '차단일시', format: 'date-time', required: false })
  blockedAt?: Date;

  @ApiProperty({ description: '차단자 ID', format: 'uuid', required: false })
  blockedBy?: string;

  /**
   * PublicShare 엔티티를 차단 응답 DTO로 변환
   */
  static fromEntity(entity: PublicShare): ShareBlockResponseDto {
    const dto = new ShareBlockResponseDto();
    dto.id = entity.id;
    dto.isBlocked = entity.isBlocked;
    dto.blockedAt = entity.blockedAt;
    dto.blockedBy = entity.blockedBy;
    return dto;
  }
}

/**
 * 일괄 차단 응답 DTO
 */
export class BulkBlockResponseDto {
  @ApiProperty({ description: '차단된 공유 수', example: 5 })
  blockedCount: number;
}

/**
 * 일괄 차단 해제 응답 DTO
 */
export class BulkUnblockResponseDto {
  @ApiProperty({ description: '차단 해제된 공유 수', example: 5 })
  unblockedCount: number;
}

/**
 * SharedFileStats 인터페이스 (도메인에서 반환)
 */
export interface SharedFileStats {
  fileId: string;
  fileName: string;
  mimeType: string;
  shareCount: number;
  activeShareCount: number;
  totalViewCount: number;
  totalDownloadCount: number;
  firstSharedAt: Date;
  lastSharedAt: Date;
}

/**
 * 공유된 파일 통계 DTO
 */
export class SharedFileStatsDto {
  @ApiProperty({ description: '파일 ID', format: 'uuid' })
  fileId: string;

  @ApiProperty({ description: '파일명', example: '설계문서.pdf' })
  fileName: string;

  @ApiProperty({ description: 'MIME 타입', example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ description: '총 공유 수', example: 10 })
  shareCount: number;

  @ApiProperty({ description: '활성 공유 수', example: 7 })
  activeShareCount: number;

  @ApiProperty({ description: '총 뷰 횟수', example: 150 })
  totalViewCount: number;

  @ApiProperty({ description: '총 다운로드 횟수', example: 30 })
  totalDownloadCount: number;

  @ApiProperty({ description: '최초 공유일시', format: 'date-time' })
  firstSharedAt: Date;

  @ApiProperty({ description: '최근 공유일시', format: 'date-time' })
  lastSharedAt: Date;

  /**
   * SharedFileStats를 DTO로 변환
   */
  static fromStats(stats: SharedFileStats): SharedFileStatsDto {
    const dto = new SharedFileStatsDto();
    dto.fileId = stats.fileId;
    dto.fileName = stats.fileName;
    dto.mimeType = stats.mimeType;
    dto.shareCount = stats.shareCount;
    dto.activeShareCount = stats.activeShareCount;
    dto.totalViewCount = stats.totalViewCount;
    dto.totalDownloadCount = stats.totalDownloadCount;
    dto.firstSharedAt = stats.firstSharedAt;
    dto.lastSharedAt = stats.lastSharedAt;
    return dto;
  }
}

/**
 * 관리자용 공유 상세 응답 DTO
 */
export class AdminShareDetailResponseDto {
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

  @ApiProperty({ description: '최대 뷰 횟수', required: false })
  maxViewCount?: number;

  @ApiProperty({ description: '현재 뷰 횟수', example: 5 })
  currentViewCount: number;

  @ApiProperty({ description: '최대 다운로드 횟수', required: false })
  maxDownloadCount?: number;

  @ApiProperty({ description: '현재 다운로드 횟수', example: 2 })
  currentDownloadCount: number;

  @ApiProperty({ description: '만료일시', format: 'date-time', required: false })
  expiresAt?: Date;

  @ApiProperty({ description: '차단 여부', example: false })
  isBlocked: boolean;

  @ApiProperty({ description: '차단일시', format: 'date-time', required: false })
  blockedAt?: Date;

  @ApiProperty({ description: '차단자 ID', format: 'uuid', required: false })
  blockedBy?: string;

  @ApiProperty({ description: '취소 여부', example: false })
  isRevoked: boolean;

  @ApiProperty({ description: '생성일시', format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시', format: 'date-time', required: false })
  updatedAt?: Date;

  /**
   * PublicShare 엔티티를 관리자용 상세 응답 DTO로 변환
   */
  static fromEntity(entity: PublicShare): AdminShareDetailResponseDto {
    const dto = new AdminShareDetailResponseDto();
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
    dto.blockedAt = entity.blockedAt;
    dto.blockedBy = entity.blockedBy;
    dto.isRevoked = entity.isRevoked;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
