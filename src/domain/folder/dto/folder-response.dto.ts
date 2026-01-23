/**
 * 폴더 응답 관련 DTO
 */

import { FolderState } from '../entities/folder.entity';
import { FolderAvailabilityStatus } from '../../storage/folder/folder-storage-object.entity';

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
  pagination: {
    page: number;
    limit: number;
    totalFolders: number;
    totalFiles: number;
  };
}

/**
 * 폴더 내용 조회 쿼리 파라미터
 */
export class GetFolderContentsQuery {
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'size';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
