/**
 * 폴더 스토리지 객체 리포지토리 인터페이스
 * 스토리지 도메인의 영속성 계층 추상화
 */

import type { QueryRunner } from 'typeorm';
import { FolderStorageObjectEntity } from '../entity/folder-storage-object.entity';

/**
 * 트랜잭션 옵션
 */
export interface TransactionOptions {
  queryRunner?: QueryRunner;
}

/**
 * 폴더 스토리지 객체 리포지토리 인터페이스
 */
export interface IFolderStorageObjectRepository {
  /**
   * 폴더 ID로 조회
   */
  findByFolderId(folderId: string, options?: TransactionOptions): Promise<FolderStorageObjectEntity | null>;

  /**
   * 폴더 ID로 조회 (락 획득) - 트랜잭션 필수
   */
  findByFolderIdForUpdate(folderId: string, options?: TransactionOptions): Promise<FolderStorageObjectEntity | null>;

  /**
   * objectKey prefix로 조회 (하위 폴더 일괄 조회)
   */
  findByObjectKeyPrefix(prefix: string, options?: TransactionOptions): Promise<FolderStorageObjectEntity[]>;

  /**
   * 저장
   */
  save(storageObject: FolderStorageObjectEntity, options?: TransactionOptions): Promise<FolderStorageObjectEntity>;

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
export const FOLDER_STORAGE_OBJECT_REPOSITORY = Symbol('FOLDER_STORAGE_OBJECT_REPOSITORY');
