/**
 * 파일 스토리지 객체 리포지토리 인터페이스
 * 스토리지 도메인의 영속성 계층 추상화
 */

import type { QueryRunner } from 'typeorm';
import { FileStorageObjectEntity, StorageType } from '../file-storage-object.entity';

/**
 * 트랜잭션 옵션
 */
export interface TransactionOptions {
  queryRunner?: QueryRunner;
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
export const FILE_STORAGE_OBJECT_REPOSITORY = Symbol('FILE_STORAGE_OBJECT_REPOSITORY');
