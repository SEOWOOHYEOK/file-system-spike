/**
 * 폴더 응답 관련 DTO
 */

import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { FolderState } from '../entities/folder.entity';
import { FolderAvailabilityStatus } from '../../storage/folder/entity/folder-storage-object.entity';

/**
 * 폴더 스토리지 상태 DTO
 */
export interface FolderStorageStatusDto {
  nas: FolderAvailabilityStatus | null;
}

/**
 * 폴더 정보 응답 DTO
 */
export class FolderInfoResponse {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  state: FolderState;
  storageStatus: FolderStorageStatusDto;
  /** 직계 파일 수 */
  fileCount: number;
  /** 직계 폴더 수 */
  folderCount: number;
  /** 하위 전체 파일 크기 합 */
  totalSize: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 브레드크럼 아이템 DTO
 */
export interface BreadcrumbItem {
  id: string;
  name: string;
}

/**
 * 폴더 목록 아이템 DTO
 */
export interface FolderListItem {
  id: string;
  name: string;
  path: string;
  storageStatus: FolderStorageStatusDto;
  fileCount: number;
  folderCount: number;
  updatedAt: string;
}

/**
 * 파일에 대한 PENDING 작업 요청 요약 정보 (목록 조회용)
 */
export interface PendingActionRequestSummary {
  id: string;
  type: 'MOVE' | 'DELETE';
  status: 'PENDING';
  requestedAt: string;
}

/**
 * 파일 목록 아이템 DTO (폴더 내용 조회용)
 */
export interface FileListItemInFolder {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  storageStatus: {
    cache: string | null;
    nas: string | null;
  };
  updatedAt: string;
  /** 해당 파일에 대한 PENDING 작업 요청 (없으면 null) */
  pendingActionRequest: PendingActionRequestSummary | null;
}

/**
 * 페이지네이션 정보 DTO
 */
export interface PaginationInfo {
  /** 현재 페이지 번호 */
  page: number;
  /** 현재 페이지 크기 */
  pageSize: number;
  /** 전체 항목 개수 (폴더 + 파일) */
  totalItems: number;
  /** 전체 페이지 수 */
  totalPages: number;
  /** 다음 페이지 존재 여부 */
  hasNext: boolean;
  /** 이전 페이지 존재 여부 */
  hasPrev: boolean;
}

/**
 * 폴더 내용 응답 DTO
 */
export class FolderContentsResponse {
  folderId: string;
  path: string;
  /** 브레드크럼 (상위 폴더 목록) */
  breadcrumbs: BreadcrumbItem[];
  /** 하위 폴더 목록 */
  folders: FolderListItem[];
  /** 파일 목록 */
  files: FileListItemInFolder[];
  /** 페이지네이션 정보 */
  pagination: PaginationInfo;
}

/**
 * 정렬 기준
 */
export enum SortBy {
  NAME = 'name',
  TYPE = 'type',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  SIZE = 'size',
}

/**
 * 정렬 순서
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * 폴더 내용 조회 쿼리 파라미터
 */
export class GetFolderContentsQuery {
  /** 정렬 기준 (name, type, createdAt, updatedAt, size) */
  @IsOptional()
  @IsEnum(SortBy, { message: '정렬 기준이 올바르지 않습니다. 허용 값: name, type, createdAt, updatedAt, size' })
  sortBy?: SortBy;

  /** 정렬 순서 (asc, desc) */
  @IsOptional()
  @IsEnum(SortOrder, { message: '정렬 순서가 올바르지 않습니다. 허용 값: asc, desc' })
  sortOrder?: SortOrder;

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
