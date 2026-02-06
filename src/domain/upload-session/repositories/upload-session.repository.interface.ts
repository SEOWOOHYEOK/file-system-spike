/**
 * 업로드 세션 리포지토리 인터페이스
 * 멀티파트 업로드 세션의 영속성 계층 추상화
 */

import type { QueryRunner } from 'typeorm';
import { UploadSessionEntity } from '../entities/upload-session.entity';
import { UploadPartEntity } from '../entities/upload-part.entity';
import { UploadSessionStatus } from '../type/upload-session.type';

/**
 * 트랜잭션 옵션
 */
export interface TransactionOptions {
  queryRunner?: QueryRunner;
}

/**
 * 세션 조회 조건
 */
export interface FindSessionOptions {
  folderId?: string;
  /** 단일 상태 또는 여러 상태 */
  status?: UploadSessionStatus | UploadSessionStatus[];
  fileId?: string;
  /** 이 시간 이전에 업데이트된 세션만 조회 */
  updatedBefore?: Date;
  /** 최대 조회 수 */
  limit?: number;
}

/**
 * 업로드 세션 리포지토리 인터페이스
 */
export interface IUploadSessionRepository {
  /**
   * ID로 세션 조회
   */
  findById(id: string, options?: TransactionOptions): Promise<UploadSessionEntity | null>;

  /**
   * ID로 세션 조회 (락 획득) - 트랜잭션 필수
   */
  findByIdForUpdate(id: string, options?: TransactionOptions): Promise<UploadSessionEntity | null>;

  /**
   * 조건으로 세션 목록 조회
   */
  findMany(options: FindSessionOptions, txOptions?: TransactionOptions): Promise<UploadSessionEntity[]>;

  /**
   * 만료된 세션 목록 조회
   */
  findExpiredSessions(limit?: number, options?: TransactionOptions): Promise<UploadSessionEntity[]>;

  /**
   * 세션 저장
   */
  save(session: UploadSessionEntity, options?: TransactionOptions): Promise<UploadSessionEntity>;

  /**
   * 세션 삭제
   */
  delete(id: string, options?: TransactionOptions): Promise<void>;

  /**
   * 만료된 세션 일괄 삭제
   */
  deleteExpiredSessions(options?: TransactionOptions): Promise<number>;

  /**
   * 전체 활성 세션 통계 조회
   * 상태가 INIT 또는 UPLOADING이고 만료되지 않은 세션의 수와 totalSize 합계
   */
  getActiveSessionStats(options?: TransactionOptions): Promise<{ count: number; totalBytes: number }>;
}

/**
 * 업로드 파트 리포지토리 인터페이스
 */
export interface IUploadPartRepository {
  /**
   * ID로 파트 조회
   */
  findById(id: string, options?: TransactionOptions): Promise<UploadPartEntity | null>;

  /**
   * 세션 ID와 파트 번호로 조회
   */
  findBySessionIdAndPartNumber(
    sessionId: string,
    partNumber: number,
    options?: TransactionOptions,
  ): Promise<UploadPartEntity | null>;

  /**
   * 세션 ID로 모든 파트 조회
   */
  findBySessionId(sessionId: string, options?: TransactionOptions): Promise<UploadPartEntity[]>;

  /**
   * 세션 ID로 완료된 파트만 조회 (정렬됨)
   */
  findCompletedBySessionId(sessionId: string, options?: TransactionOptions): Promise<UploadPartEntity[]>;

  /**
   * 파트 저장
   */
  save(part: UploadPartEntity, options?: TransactionOptions): Promise<UploadPartEntity>;

  /**
   * 파트 삭제
   */
  delete(id: string, options?: TransactionOptions): Promise<void>;

  /**
   * 세션 ID로 모든 파트 삭제
   */
  deleteBySessionId(sessionId: string, options?: TransactionOptions): Promise<void>;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const UPLOAD_SESSION_REPOSITORY = Symbol('UPLOAD_SESSION_REPOSITORY');
export const UPLOAD_PART_REPOSITORY = Symbol('UPLOAD_PART_REPOSITORY');
