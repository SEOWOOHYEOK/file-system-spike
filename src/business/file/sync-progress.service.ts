/**
 * 동기화 진행률 조회 서비스
 * NAS 동기화 작업의 실시간 진행률을 조회합니다.
 */

import { Injectable, Inject } from '@nestjs/common';
import {
  PROGRESS_STORAGE_PORT,
  type IProgressStoragePort,
} from '../../infra/queue/progress-storage.port';
import { SyncProgressResponseDto } from '../../interface/controller/file/dto/sync-progress-response.dto';

@Injectable()
export class SyncProgressService {
  constructor(
    @Inject(PROGRESS_STORAGE_PORT)
    private readonly progressStorage: IProgressStoragePort,
  ) {}

  /**
   * 동기화 이벤트의 진행률 조회
   * @param syncEventId - 동기화 이벤트 ID
   * @returns 진행률 정보
   */
  async getProgress(syncEventId: string): Promise<SyncProgressResponseDto> {
    const progress = await this.progressStorage.get(syncEventId);

    if (!progress) {
      return {
        syncEventId,
        fileId: null,
        status: 'IDLE',
        message: '현재 진행 중인 동기화 작업이 없습니다.',
      };
    }

    return {
      syncEventId: progress.syncEventId,
      fileId: progress.fileId,
      eventType: progress.eventType,
      status: progress.status,
      progress: progress.progress,
      startedAt: progress.startedAt,
      updatedAt: progress.updatedAt,
      errorMessage: progress.error,
    };
  }
}
