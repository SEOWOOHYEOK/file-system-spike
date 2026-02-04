/**
 * 동기화 이벤트 도메인 서비스
 * SyncEventEntity 조회 로직을 제공합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import { SYNC_EVENT_REPOSITORY } from '../repositories/sync-event.repository.interface';
import type { ISyncEventRepository, TransactionOptions } from '../repositories/sync-event.repository.interface';
import type { SyncEventEntity, SyncEventStatus } from '../entities/sync-event.entity';

@Injectable()
export class SyncEventDomainService {
  constructor(
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly repository: ISyncEventRepository,
  ) {}

  /**
   * ID로 동기화 이벤트 조회
   */
  async 조회(syncEventId: string, txOptions?: TransactionOptions): Promise<SyncEventEntity | null> {
    return this.repository.findById(syncEventId, txOptions);
  }

  /**
   * 파일 ID 기준 동기화 이벤트 조회
   */
  async 파일별조회(fileId: string, txOptions?: TransactionOptions): Promise<SyncEventEntity[]> {
    return this.repository.findByFileId(fileId, txOptions);
  }

  /**
   * 파일 ID로 동기화 이벤트 조회 (별칭)
   */
  async 파일아이디조회(fileId: string, txOptions?: TransactionOptions): Promise<SyncEventEntity[]> {
    return this.repository.findByFileId(fileId, txOptions);
  }

  /**
   * 폴더 ID로 동기화 이벤트 조회
   */
  async 폴더아이디조회(folderId: string, txOptions?: TransactionOptions): Promise<SyncEventEntity[]> {
    return this.repository.findByFolderId(folderId, txOptions);
  }

  /**
   * 상태별 동기화 이벤트 조회
   */
  async 상태별조회(status: SyncEventStatus, txOptions?: TransactionOptions): Promise<SyncEventEntity[]> {
    return this.repository.findByStatus(status, txOptions);
  }

  /**
   * 여러 ID로 동기화 이벤트 조회
   */
  async 아이디목록조회(syncEventIds: string[], txOptions?: TransactionOptions): Promise<SyncEventEntity[]> {
    return this.repository.findByIds(syncEventIds, txOptions);
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * 동기화 이벤트 저장
   * 새 이벤트를 생성하거나 기존 이벤트를 업데이트합니다.
   *
   * @param syncEvent - 저장할 동기화 이벤트 엔티티
   * @param txOptions - 트랜잭션 옵션
   * @returns 저장된 동기화 이벤트 엔티티
   */
  async 저장(syncEvent: SyncEventEntity, txOptions?: TransactionOptions): Promise<SyncEventEntity> {
    return this.repository.save(syncEvent, txOptions);
  }
}
