/**
 * 파일 스토리지 객체 리포지토리 인터페이스
 * 스토리지 도메인의 영속성 계층 추상화
 */

import type { QueryRunner } from 'typeorm';
import { FileStorageObjectEntity, StorageType } from '../entity/file-storage-object.entity';

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

  /**
   * Eviction 대상 조회 (LRU 기준)
   * 조건: CACHE 타입, AVAILABLE 상태, leaseCount=0, NAS에 동기화 완료된 파일
   * @param limit 조회할 최대 개수
   * @param options 트랜잭션 옵션
   * @returns LRU 기준으로 정렬된 Eviction 대상 목록
   */
  findEvictionCandidatesLRU(
    limit: number,
    options?: TransactionOptions,
  ): Promise<FileStorageObjectEntity[]>;

  /**
   * Atomic 상태 전환 (AVAILABLE -> EVICTING)
   * Race Condition 방지를 위해 leaseCount=0 조건 포함
   * @param fileId 파일 ID
   * @param options 트랜잭션 옵션
   * @returns 영향받은 row 수 (0: 이미 lease 중이거나 상태 변경됨, 1: 성공)
   */
  tryMarkEvicting(
    fileId: string,
    options?: TransactionOptions,
  ): Promise<number>;

  /**
   * Eviction 완료 후 캐시 레코드 삭제
   * @param fileId 파일 ID
   * @param options 트랜잭션 옵션
   */
  deleteCacheRecord(
    fileId: string,
    options?: TransactionOptions,
  ): Promise<void>;

  /**
   * 캐시 상세 통계 조회
   * - 상태별 파일 수
   * - lease 중인 파일 수
   * - NAS 미동기화 파일 수
   */
  getCacheDetailedStats(
    options?: TransactionOptions,
  ): Promise<CacheDetailedStats>;
}

/**
 * 캐시 상세 통계 타입
 */
export interface CacheDetailedStats {
  /** 전체 캐시 파일 수 */
  totalCount: number;
  /** 상태별 파일 수 */
  byStatus: Record<string, number>;
  /** lease 중인 파일 수 (leaseCount > 0) */
  leasedCount: number;
  /** NAS에 동기화되지 않은 파일 수 (NAS 객체가 없거나 NAS가 AVAILABLE이 아닌 파일) */
  unsyncedToNasCount: number;
  /** Eviction 가능한 파일 수 (AVAILABLE, leaseCount=0, NAS 동기화 완료) */
  evictableCount: number;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const FILE_STORAGE_OBJECT_REPOSITORY = Symbol('FILE_STORAGE_OBJECT_REPOSITORY');
