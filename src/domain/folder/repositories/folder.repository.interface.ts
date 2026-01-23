/**
 * 폴더 리포지토리 인터페이스
 * 폴더 도메인의 영속성 계층 추상화
 */

import { FolderEntity, FolderState } from '../entities/folder.entity';
import { FolderStorageObjectEntity } from '../../storage/folder/folder-storage-object.entity';

/**
 * 폴더 조회 조건
 */
export interface FindFolderOptions {
  parentId?: string | null;
  name?: string;
  state?: FolderState;
  path?: string;
}

/**
 * 폴더 리포지토리 인터페이스
 */
export interface IFolderRepository {
  /**
   * ID로 폴더 조회
   */
  findById(id: string): Promise<FolderEntity | null>;

  /**
   * ID로 폴더 조회 (락 획득)
   */
  findByIdForUpdate(id: string): Promise<FolderEntity | null>;

  /**
   * 조건으로 폴더 조회
   */
  findOne(options: FindFolderOptions): Promise<FolderEntity | null>;

  /**
   * 상위 폴더 내 하위 폴더 목록 조회
   */
  findByParentId(parentId: string | null, state?: FolderState): Promise<FolderEntity[]>;

  /**
   * 동일 폴더명 존재 확인
   */
  existsByNameInParent(
    parentId: string | null,
    name: string,
    excludeFolderId?: string,
  ): Promise<boolean>;

  /**
   * 하위 모든 폴더 조회 (재귀)
   */
  findAllDescendants(folderId: string, state?: FolderState): Promise<FolderEntity[]>;

  /**
   * 상위 폴더 체인 조회 (브레드크럼)
   */
  findAncestors(folderId: string): Promise<FolderEntity[]>;

  /**
   * 폴더 저장
   */
  save(folder: FolderEntity): Promise<FolderEntity>;

  /**
   * 폴더 삭제
   */
  delete(id: string): Promise<void>;

  /**
   * 다수 폴더 상태 일괄 변경
   */
  updateStateByIds(ids: string[], state: FolderState): Promise<number>;

  /**
   * 경로 일괄 업데이트 (하위 폴더)
   */
  updatePathByPrefix(oldPrefix: string, newPrefix: string): Promise<number>;

  /**
   * 폴더 + 하위 통계 조회 (파일 수, 폴더 수, 전체 크기)
   */
  getStatistics(folderId: string): Promise<{
    fileCount: number;
    folderCount: number;
    totalSize: number;
  }>;
}

/**
 * 폴더 스토리지 객체 리포지토리 인터페이스
 */
export interface IFolderStorageObjectRepository {
  /**
   * 폴더 ID로 조회
   */
  findByFolderId(folderId: string): Promise<FolderStorageObjectEntity | null>;

  /**
   * 폴더 ID로 조회 (락 획득)
   */
  findByFolderIdForUpdate(folderId: string): Promise<FolderStorageObjectEntity | null>;

  /**
   * 저장
   */
  save(storageObject: FolderStorageObjectEntity): Promise<FolderStorageObjectEntity>;

  /**
   * 삭제
   */
  delete(id: string): Promise<void>;

  /**
   * 폴더 ID로 삭제
   */
  deleteByFolderId(folderId: string): Promise<void>;

  /**
   * 다수 폴더의 스토리지 상태 일괄 변경
   */
  updateStatusByFolderIds(folderIds: string[], status: string): Promise<number>;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const FOLDER_REPOSITORY = Symbol('FOLDER_REPOSITORY');
export const FOLDER_STORAGE_OBJECT_REPOSITORY = Symbol('FOLDER_STORAGE_OBJECT_REPOSITORY');
