/**
 * 동기화 이벤트 도메인 서비스
 * SyncEventEntity 조회 로직을 제공합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import { SYNC_EVENT_REPOSITORY } from '../repositories/sync-event.repository.interface';
import type { ISyncEventRepository } from '../repositories/sync-event.repository.interface';
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
  async 조회(syncEventId: string): Promise<SyncEventEntity | null> {
    return this.repository.findById(syncEventId);
  }

  /**
   * 파일 ID 기준 동기화 이벤트 조회
   */
  async 파일별조회(fileId: string): Promise<SyncEventEntity[]> {
    return this.repository.findByFileId(fileId);
  }

  /**
   * 상태별 동기화 이벤트 조회
   */
  async 상태별조회(status: SyncEventStatus): Promise<SyncEventEntity[]> {
    return this.repository.findByStatus(status);
  }
}
