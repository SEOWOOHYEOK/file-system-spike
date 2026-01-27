/**
 * 동기화 이벤트 Repository 인터페이스
 */

import { SyncEventEntity, SyncEventStatus } from '../entities/sync-event.entity';

/**
 * Repository DI 토큰
 */
export const SYNC_EVENT_REPOSITORY = Symbol('SYNC_EVENT_REPOSITORY');

/**
 * 동기화 이벤트 Repository 인터페이스
 */
export interface ISyncEventRepository {
  /**
   * ID로 조회
   */
  findById(id: string): Promise<SyncEventEntity | null>;

  /**
   * 여러 ID로 조회
   */
  findByIds(ids: string[]): Promise<SyncEventEntity[]>;

  /**
   * 파일 ID로 조회
   */
  findByFileId(fileId: string): Promise<SyncEventEntity[]>;

  /**
   * 상태별 조회
   */
  findByStatus(status: SyncEventStatus): Promise<SyncEventEntity[]>;

  /**
   * 저장 (생성/수정)
   */
  save(entity: SyncEventEntity): Promise<SyncEventEntity>;

  /**
   * 삭제
   */
  delete(id: string): Promise<void>;

  /**
   * 상태 업데이트
   */
  updateStatus(id: string, status: SyncEventStatus, errorMessage?: string): Promise<void>;
}
