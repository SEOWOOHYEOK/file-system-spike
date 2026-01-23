/**
 * 휴지통 아이템 관련 DTO
 */

import { TrashItemType } from '../entities/trash-metadata.entity';

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
 * 휴지통 목록 응답 DTO
 */
export interface TrashListResponse {
  items: TrashItem[];
  totalCount: number;
  /** 휴지통 전체 크기 */
  totalSizeBytes: number;
}

/**
 * 휴지통 목록 조회 쿼리 파라미터
 */
export class GetTrashListQuery {
  sortBy?: 'name' | 'originalPath' | 'deletedAt' | 'sizeBytes' | 'modifiedAt';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
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
