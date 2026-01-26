/**
 * 휴지통 아이템 관련 DTO
 */

import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TrashItemType } from '../entities/trash-metadata.entity';

/**
 * 휴지통 정렬 기준
 */
export enum TrashSortBy {
  NAME = 'name',
  ORIGINAL_PATH = 'originalPath',
  DELETED_AT = 'deletedAt',
  SIZE = 'sizeBytes',
  MODIFIED_AT = 'modifiedAt',
}

/**
 * 휴지통 정렬 순서
 */
export enum TrashSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * 휴지통 아이템 DTO
 */
export interface TrashItem {
  type: TrashItemType;
  id: string;
  name: string;
  /** 크기 (파일만, 폴더는 null) */
  sizeBytes?: number;
  mimeType?: string;
  /** 휴지통 메타 ID (복구/삭제 시 사용) */
  trashMetadataId: string;
  /** 원래 위치 */
  originalPath: string;
  /** 삭제된 날짜 */
  deletedAt: string;
  /** 삭제자 */
  deletedBy: string;
  /** 수정한 날짜 (삭제 전 마지막 수정일) */
  modifiedAt: string;
  /** 자동 영구삭제 예정일 */
  expiresAt: string;
}

/**
 * 휴지통 페이지네이션 정보 DTO
 */
export interface TrashPaginationInfo {
  /** 현재 페이지 번호 */
  page: number;
  /** 현재 페이지 크기 */
  pageSize: number;
  /** 전체 항목 개수 */
  totalItems: number;
  /** 전체 페이지 수 */
  totalPages: number;
  /** 다음 페이지 존재 여부 */
  hasNext: boolean;
  /** 이전 페이지 존재 여부 */
  hasPrev: boolean;
}

/**
 * 휴지통 목록 응답 DTO
 */
export interface TrashListResponse {
  items: TrashItem[];
  /** 휴지통 전체 크기 */
  totalSizeBytes: number;
  /** 페이지네이션 정보 */
  pagination: TrashPaginationInfo;
}

/**
 * 휴지통 목록 조회 쿼리 파라미터
 */
export class GetTrashListQuery {
  /** 정렬 기준 (name, originalPath, deletedAt, sizeBytes, modifiedAt) */
  @IsOptional()
  @IsEnum(TrashSortBy, { message: '정렬 기준이 올바르지 않습니다. 허용 값: name, originalPath, deletedAt, sizeBytes, modifiedAt' })
  sortBy?: TrashSortBy;

  /** 정렬 순서 (asc, desc) */
  @IsOptional()
  @IsEnum(TrashSortOrder, { message: '정렬 순서가 올바르지 않습니다. 허용 값: asc, desc' })
  sortOrder?: TrashSortOrder;

  /** 페이지 번호 (1부터 시작, 기본값: 1) */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: '페이지 번호는 정수여야 합니다.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 합니다.' })
  page?: number;

  /** 페이지 크기 (기본값: 50, 최대: 100) */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: '페이지 크기는 정수여야 합니다.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 합니다.' })
  @Max(100, { message: '페이지 크기는 100 이하여야 합니다.' })
  pageSize?: number;
}

/**
 * 휴지통 폴더 내용 아이템 DTO
 */
export interface TrashFolderItem {
  type: TrashItemType;
  id: string;
  name: string;
  sizeBytes?: number;
  mimeType?: string;
  modifiedAt: string;
}

/**
 * 휴지통 폴더 내용 응답 DTO
 */
export interface TrashFolderContentsResponse {
  /** 현재 폴더 정보 */
  currentFolder: {
    id: string;
    name: string;
  };
  /** 상위 폴더 정보 (뒤로가기용, 최상위면 null) */
  parentFolder?: {
    id: string;
    name: string;
  };
  /** 브레드크럼 경로 (휴지통 루트 → 현재 폴더) */
  breadcrumb: {
    id: string;
    name: string;
  }[];
  /** 하위 항목들 */
  items: TrashFolderItem[];
  totalCount: number;
}
