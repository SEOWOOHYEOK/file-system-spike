/**
 * 파일 리포지토리 인터페이스
 * 파일 도메인의 영속성 계층 추상화
 */

import type { QueryRunner } from 'typeorm';
import { FileEntity } from '../entities/file.entity';
import { FileState } from '../type/file.type';
import { FileStorageObjectEntity, StorageType } from '../../storage/file/file-storage-object.entity';

/**
 * 파일 조회 조건
 */
export interface FindFileOptions {
  folderId?: string;
  name?: string;
  mimeType?: string;
  state?: FileState;
}

/**
 * 트랜잭션 옵션
 */
export interface TransactionOptions {
  queryRunner?: QueryRunner;
}

/**
 * 파일 리포지토리 인터페이스
 */
export interface IFileRepository {
  /**
   * ID로 파일 조회
   */
  findById(id: string, options?: TransactionOptions): Promise<FileEntity | null>;

  /**
   * 여러 ID로 파일 일괄 조회
   */
  findByIds(ids: string[], options?: TransactionOptions): Promise<FileEntity[]>;

  /**
   * ID로 파일 조회 (락 획득) - 트랜잭션 필수
   */
  findByIdForUpdate(id: string, options?: TransactionOptions): Promise<FileEntity | null>;

  /**
   * 조건으로 파일 조회
   */
  findOne(options: FindFileOptions, txOptions?: TransactionOptions): Promise<FileEntity | null>;

  /**
   * 폴더 내 파일 목록 조회
   */
  findByFolderId(folderId: string, state?: FileState, options?: TransactionOptions): Promise<FileEntity[]>;

  /**
   * 동일 파일명 존재 확인
   * @param createdAt 동일 createdAt 값도 체크할 경우 전달
   */
  existsByNameInFolder(
    folderId: string,
    name: string,
    mimeType: string,
    excludeFileId?: string,
    options?: TransactionOptions,
    createdAt?: Date,
  ): Promise<boolean>;

  /**
   * 파일 저장
   */
  save(file: FileEntity, options?: TransactionOptions): Promise<FileEntity>;

  /**
   * 파일 삭제
   */
  delete(id: string, options?: TransactionOptions): Promise<void>;

  /**
   * 다수 파일 상태 일괄 변경
   */
  updateStateByFolderIds(folderIds: string[], state: FileState, options?: TransactionOptions): Promise<number>;
}

/**
 * 파일 스토리지 객체 리포지토리 인터페이스
 */
export interface IFileStorageObjectRepository {
  /**
   * 파일 ID와 스토리지 타입으로 조회
   */
  findByFileIdAndType(
    fileId: string,
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity | null>;

  /**
   * 파일 ID와 스토리지 타입으로 조회 (락 획득) - 트랜잭션 필수
   */
  findByFileIdAndTypeForUpdate(
    fileId: string,
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity | null>;

  /**
   * 파일 ID로 모든 스토리지 객체 조회
   */
  findByFileId(fileId: string, options?: TransactionOptions): Promise<FileStorageObjectEntity[]>;

  /**
   * 저장
   */
  save(storageObject: FileStorageObjectEntity, options?: TransactionOptions): Promise<FileStorageObjectEntity>;

  /**
   * 삭제
   */
  delete(id: string, options?: TransactionOptions): Promise<void>;

  /**
   * 파일 ID로 모든 스토리지 객체 삭제
   */
  deleteByFileId(fileId: string, options?: TransactionOptions): Promise<void>;

  /**
   * 다수 파일의 스토리지 상태 일괄 변경
   */
  updateStatusByFileIds(
    fileIds: string[],
    storageType: StorageType,
    status: string,
    options?: TransactionOptions,
  ): Promise<number>;

  /**
   * 스토리지 타입별로 페이징 조회 (일관성 검증용)
   */
  findByStorageType(
    storageType: StorageType,
    limit: number,
    offset: number,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity[]>;

  /**
   * 샘플링 조회 - 랜덤 샘플 (일관성 검증용)
   */
  findRandomSamples(
    storageType: StorageType,
    count: number,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity[]>;

  /**
   * 스토리지 타입별 전체 개수 조회
   */
  countByStorageType(
    storageType: StorageType,
    options?: TransactionOptions,
  ): Promise<number>;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const FILE_REPOSITORY = Symbol('FILE_REPOSITORY');
export const FILE_STORAGE_OBJECT_REPOSITORY = Symbol('FILE_STORAGE_OBJECT_REPOSITORY');
