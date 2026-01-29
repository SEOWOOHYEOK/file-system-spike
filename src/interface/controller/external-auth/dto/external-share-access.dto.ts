import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PublicShare } from '../../../../domain/external-share/entities/public-share.entity';

/**
 * 콘텐츠 토큰 쿼리 DTO
 */
export class ContentTokenQueryDto {
  @ApiProperty({
    description: '콘텐츠 접근 토큰 (상세 조회 시 발급)',
    example: 'ct_abc123def456...',
  })
  @IsString()
  @IsNotEmpty({ message: '콘텐츠 토큰을 입력해주세요.' })
  token: string;
}

/**
 * 나에게 공유된 파일 목록 아이템 DTO
 */
export class MyShareListItemDto {
  @ApiProperty({ description: '공유 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '파일 ID', format: 'uuid' })
  fileId: string;

  @ApiProperty({ description: '파일명', example: '설계문서.pdf' })
  fileName: string;

  @ApiProperty({ description: '권한 목록', example: ['VIEW', 'DOWNLOAD'] })
  permissions: string[];

  @ApiProperty({ description: '만료일시', format: 'date-time', required: false })
  expiresAt?: Date;

  @ApiProperty({ description: '생성일시', format: 'date-time' })
  createdAt: Date;

  /**
   * PublicShare 엔티티를 목록 아이템 DTO로 변환
   * (파일 메타데이터가 채워진 PublicShare 필요)
   */
  static fromEntity(entity: PublicShare): MyShareListItemDto {
    const dto = new MyShareListItemDto();
    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.fileName = entity.fileName;
    dto.permissions = entity.permissions as string[];
    dto.expiresAt = entity.expiresAt;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/**
 * 공유 상세 조회 응답 - 공유 정보
 */
export class ShareDetailDto {
  @ApiProperty({ description: '공유 ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: '파일 ID', format: 'uuid' })
  fileId: string;

  @ApiProperty({ description: '파일명', example: '설계문서.pdf' })
  fileName: string;

  @ApiProperty({ description: '파일 크기 (bytes)', example: 1024000 })
  fileSize: number;

  @ApiProperty({ description: 'MIME 타입', example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ description: '권한 목록', example: ['VIEW', 'DOWNLOAD'] })
  permissions: string[];

  @ApiProperty({ description: '최대 뷰 횟수', required: false })
  maxViewCount?: number;

  @ApiProperty({ description: '현재 뷰 횟수', example: 3 })
  currentViewCount: number;

  @ApiProperty({ description: '최대 다운로드 횟수', required: false })
  maxDownloadCount?: number;

  @ApiProperty({ description: '현재 다운로드 횟수', example: 1 })
  currentDownloadCount: number;

  @ApiProperty({ description: '만료일시', format: 'date-time', required: false })
  expiresAt?: Date;

  /**
   * PublicShare 엔티티를 상세 DTO로 변환
   * (파일 메타데이터가 채워진 PublicShare 필요)
   */
  static fromEntity(entity: PublicShare): ShareDetailDto {
    const dto = new ShareDetailDto();
    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.fileName = entity.fileName;
    dto.fileSize = entity.fileSize;
    dto.mimeType = entity.mimeType;
    dto.permissions = entity.permissions as string[];
    dto.maxViewCount = entity.maxViewCount;
    dto.currentViewCount = entity.currentViewCount;
    dto.maxDownloadCount = entity.maxDownloadCount;
    dto.currentDownloadCount = entity.currentDownloadCount;
    dto.expiresAt = entity.expiresAt;
    return dto;
  }
}

/**
 * ShareDetailResult 인터페이스
 * (서비스에서 반환하는 공유 상세 결과)
 */
export interface ShareDetailResult {
  share: PublicShare;
  contentToken: string;
}

/**
 * 공유 상세 조회 응답 DTO
 */
export class ShareDetailResponseDto {
  @ApiProperty({ description: '공유 정보', type: ShareDetailDto })
  share: ShareDetailDto;

  @ApiProperty({
    description: '파일 접근용 일회성 토큰',
    example: 'ct_abc123def456...',
  })
  contentToken: string;

  @ApiProperty({
    description: '콘텐츠 토큰 만료 시간',
    format: 'date-time',
  })
  tokenExpiresAt: Date;

  /**
   * ShareDetailResult를 Response DTO로 변환
   * @param result 서비스에서 반환된 공유 상세 결과
   * @param tokenTtlSeconds 토큰 TTL (초)
   */
  static fromResult(result: ShareDetailResult, tokenTtlSeconds: number = 60): ShareDetailResponseDto {
    const dto = new ShareDetailResponseDto();
    dto.share = ShareDetailDto.fromEntity(result.share);
    dto.contentToken = result.contentToken;
    dto.tokenExpiresAt = new Date(Date.now() + tokenTtlSeconds * 1000);
    return dto;
  }
}
