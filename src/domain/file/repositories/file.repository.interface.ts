/**
 * 파일 리포지토리 인터페이스
 * 파일 도메인의 영속성 계층 추상화
 */

import type { QueryRunner } from 'typeorm';
import { FileEntity } from '../entities/file.entity';
import { FileState } from '../type/file.type';

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

  /**
   * 이름 패턴으로 파일 검색 (ACTIVE 상태만)
   * @param namePattern 검색할 이름 패턴 (LIKE 검색)
   * @param limit 최대 결과 수
   * @param offset 오프셋
   * @returns 검색된 파일 목록과 총 개수
   */
  searchByNamePattern(
    namePattern: string,
    limit: number,
    offset: number,
  ): Promise<{ items: FileEntity[]; total: number }>;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const FILE_REPOSITORY = Symbol('FILE_REPOSITORY');
