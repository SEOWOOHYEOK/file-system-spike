/**
 * 휴지통 리포지토리 인터페이스
 * 휴지통 도메인의 영속성 계층 추상화
 */

import { TrashMetadataEntity, TrashItemType } from '../entities/trash-metadata.entity';

/**
 * 휴지통 조회 조건
 */
export interface FindTrashOptions {
  fileId?: string;
  folderId?: string;
  deletedBy?: string;
}

/**
 * 휴지통 리포지토리 인터페이스
 */
export interface ITrashRepository {
  /**
   * ID로 휴지통 메타데이터 조회
   */
  findById(id: string): Promise<TrashMetadataEntity | null>;

  /**
   * 파일 ID로 조회
   */
  findByFileId(fileId: string): Promise<TrashMetadataEntity | null>;

  /**
   * 폴더 ID로 조회
   */
  findByFolderId(folderId: string): Promise<TrashMetadataEntity | null>;

  /**
   * 전체 휴지통 목록 조회
   */
  findAll(options?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<TrashMetadataEntity[]>;

  /**
   * 휴지통 아이템 수 조회
   */
  count(): Promise<number>;

  /**
   * 만료된 아이템 조회
   */
  findExpired(limit?: number): Promise<TrashMetadataEntity[]>;

  /**
   * 저장
   */
  save(trashMetadata: TrashMetadataEntity): Promise<TrashMetadataEntity>;

  /**
   * 삭제
   */
  delete(id: string): Promise<void>;

  /**
   * 파일 ID로 삭제
   */
  deleteByFileId(fileId: string): Promise<void>;

  /**
   * 폴더 ID로 삭제
   */
  deleteByFolderId(folderId: string): Promise<void>;

  /**
   * 전체 삭제
   */
  deleteAll(): Promise<number>;

  /**
   * 휴지통 전체 크기 계산 (파일만)
   */
  getTotalSize(): Promise<number>;
}

/**
 * 휴지통 조회 서비스 인터페이스 (조인 쿼리용)
 */
export interface ITrashQueryService {
  /**
   * 휴지통 목록 조회 (파일/폴더 정보 포함)
   */
  getTrashList(options?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<{
      type: TrashItemType;
      id: string;
      name: string;
      sizeBytes?: number;
      mimeType?: string;
      trashMetadataId: string;
      originalPath: string;
      deletedAt: Date;
      deletedBy: string;
      modifiedAt: Date;
      expiresAt: Date;
    }>;
    totalCount: number;
    totalSizeBytes: number;
  }>;

  /**
   * 휴지통 폴더 내용 조회
   */
  getTrashFolderContents(folderId: string): Promise<{
    currentFolder: { id: string; name: string };
    parentFolder?: { id: string; name: string };
    breadcrumb: { id: string; name: string }[];
    items: Array<{
      type: TrashItemType;
      id: string;
      name: string;
      sizeBytes?: number;
      mimeType?: string;
      modifiedAt: Date;
    }>;
    totalCount: number;
  }>;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const TRASH_REPOSITORY = Symbol('TRASH_REPOSITORY');
export const TRASH_QUERY_SERVICE = Symbol('TRASH_QUERY_SERVICE');
