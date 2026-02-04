/**
 * 동기화 이벤트 Repository 인터페이스
 */

import type { QueryRunner } from 'typeorm';
import { SyncEventEntity, SyncEventStatus } from '../entities/sync-event.entity';

/**
 * Repository DI 토큰
 */
export const SYNC_EVENT_REPOSITORY = Symbol('SYNC_EVENT_REPOSITORY');

/**
 * 트랜잭션 옵션
 */
export interface TransactionOptions {
  queryRunner?: QueryRunner;
}

/**
 * 동기화 이벤트 Repository 인터페이스
 */
export interface ISyncEventRepository {
  /**
   * ID로 조회
   */
  findById(id: string, options?: TransactionOptions): Promise<SyncEventEntity | null>;

  /**
   * 여러 ID로 조회
   */
  findByIds(ids: string[], options?: TransactionOptions): Promise<SyncEventEntity[]>;

  /**
   * 파일 ID로 조회
   */
  findByFileId(fileId: string, options?: TransactionOptions): Promise<SyncEventEntity[]>;

  /**
   * 폴더 ID로 조회
   */
  findByFolderId(folderId: string, options?: TransactionOptions): Promise<SyncEventEntity[]>;

  /**
   * 상태별 조회
   */
  findByStatus(status: SyncEventStatus, options?: TransactionOptions): Promise<SyncEventEntity[]>;

  /**
   * 저장 (생성/수정)
   */
  save(entity: SyncEventEntity, options?: TransactionOptions): Promise<SyncEventEntity>;

  /**
   * 삭제
   */
  delete(id: string, options?: TransactionOptions): Promise<void>;

  /**
   * 상태 업데이트
   */
  updateStatus(id: string, status: SyncEventStatus, errorMessage?: string, options?: TransactionOptions): Promise<void>;

  /**
   * 오래된 PENDING 상태 SyncEvent 조회 (복구 스케줄러용)
   * @param olderThanMs 지정된 밀리초보다 오래된 이벤트만 조회
   */
  findStalePending(olderThanMs: number, options?: TransactionOptions): Promise<SyncEventEntity[]>;
}
