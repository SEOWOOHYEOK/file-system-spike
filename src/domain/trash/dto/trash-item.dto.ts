/**
 * 휴지통 아이템 관련 DTO
 * 설계 문서: 060-1.휴지통_처리_FLOW.md
 */

import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RestorePathStatus } from './restore.dto';

/**
 * 휴지통 정렬 기준
 */
export enum TrashSortBy {
  NAME = 'name',
  SIZE = 'sizeBytes',
  MIME_TYPE = 'mimeType',
  DELETED_AT = 'deletedAt',
  EXPIRES_AT = 'expiresAt',
  DELETED_BY = 'deletedBy',
}

/**
 * 휴지통 정렬 순서
 */
export enum TrashSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * MIME 카테고리
 */
export enum MimeCategory {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  ARCHIVE = 'archive',
  OTHER = 'other',
}

/**
 * 휴지통 목록 조회 쿼리 파라미터
 * GET /trash
 */
export class TrashListQuery {
  // === 페이지네이션 ===
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // === 정렬 ===
  @IsOptional()
  @IsEnum(TrashSortBy)
  sortBy?: TrashSortBy = TrashSortBy.DELETED_AT;

  @IsOptional()
  @IsEnum(TrashSortOrder)
  order?: TrashSortOrder = TrashSortOrder.DESC;

  // === 검색 ===
  @IsOptional()
  @IsString()
  search?: string;

  // === 필터 ===
  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsEnum(MimeCategory)
  mimeCategory?: MimeCategory;

  @IsOptional()
  @IsString()
  deletedBy?: string;

  @IsOptional()
  @IsString()
  deletedAfter?: string;

  @IsOptional()
  @IsString()
  deletedBefore?: string;

  @IsOptional()
  @IsString()
  expiresAfter?: string;

  @IsOptional()
  @IsString()
  expiresBefore?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  minSize?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  maxSize?: number;

  @IsOptional()
  @IsString()
  originalFolderId?: string;
}

/**
 * 휴지통 아이템 DTO
 */
export interface TrashItem {
  type: 'FILE'; // 항상 FILE (폴더는 휴지통에 가지 않음)
  id: string;                  // 파일 ID
  name: string;                // 파일명
  sizeBytes: number;           // 파일 크기
  mimeType: string;            // MIME 타입
  extension: string;           // 확장자
  
  trashMetadataId: string;     // 휴지통 메타 ID
  originalPath: string;        // 원래 경로 (폴더 경로)
  originalFolderId: string;    // 원래 폴더 ID (삭제 시점의 폴더 ID)
  originalFolderName: string;  // 원래 폴더명
  
  deletedAt: Date;             // 삭제일시
  deletedBy: string;           // 삭제자 ID
  deletedByName: string;       // 삭제자 이름
  expiresAt: Date;             // 자동 영구삭제 예정일
  daysUntilExpiry: number;     // 만료까지 남은 일수
  
  createdAt: Date;             // 파일 생성일 (충돌 판단용)
  
  // ★ 복구 경로 상태 (경로명 기준)
  restoreInfo: {
    pathStatus: RestorePathStatus;  // AVAILABLE: 복구가능, NOT_FOUND: 복구 불가
    resolveFolderId: string | null; // 경로명으로 찾은 현재 폴더 ID (있으면)
  };
}

/**
 * 휴지통 목록 응답 DTO
 */
export interface TrashListResponse {
  items: TrashItem[];
  totalCount: number;
  totalSizeBytes: number;
  
  // 페이지네이션 정보
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  
  // 적용된 필터 요약
  appliedFilters: {
    search?: string;
    mimeType?: string;
    mimeCategory?: string;
    deletedBy?: string;
    dateRange?: { from?: string; to?: string };
    sizeRange?: { min?: number; max?: number };
  };
}

/**
 * 휴지통 비우기 응답 DTO
 */
export interface EmptyTrashResponse {
  message: string;
  success: number;
  failed: number;
}
