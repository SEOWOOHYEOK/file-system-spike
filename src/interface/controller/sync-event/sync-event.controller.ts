/**
 * 동기화 이벤트 컨트롤러
 * NAS 동기화 상태 조회 API
 */
import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SYNC_EVENT_REPOSITORY } from '../../../domain/sync-event';
import {
  FILE_REPOSITORY,
  StorageType,
} from '../../../domain/file';
import { FILE_STORAGE_OBJECT_REPOSITORY } from '../../../domain/storage';

import type { ISyncEventRepository } from '../../../domain/sync-event';
import type { IFileRepository } from '../../../domain/file';
import type { IFileStorageObjectRepository } from '../../../domain/storage';

import { ApiSyncEventStatus, ApiFileSyncStatus } from './sync-event.swagger';

/**
 * 동기화 이벤트 상태 응답
 */
interface SyncEventStatusResponse {
  id: string;
  eventType: string;
  targetType: string;
  status: string;
  progress: number;
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  processedAt?: string;
}

/**
 * 파일 동기화 상태 응답
 */
interface FileSyncStatusResponse {
  fileId: string;
  storageStatus: {
    cache: 'AVAILABLE' | 'MISSING';
    nas: 'AVAILABLE' | 'SYNCING' | 'ERROR';
  };
  activeSyncEvent?: {
    id: string;
    eventType: string;
    status: string;
    progress: number;
    createdAt: string;
  };
}

/**
 * 동기화 이벤트 컨트롤러
 */
@ApiTags('250.동기화')
@Controller('v1')
export class SyncEventController {
  constructor(
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
  ) {}

  /**
   * GET /sync-events/:syncEventId - 동기화 이벤트 상태 조회
   */
  @Get('sync-events/:syncEventId')
  @ApiSyncEventStatus()
  async getSyncEventStatus(
    @Param('syncEventId') syncEventId: string,
  ): Promise<SyncEventStatusResponse> {
    const syncEvent = await this.syncEventRepository.findById(syncEventId);
    
    if (!syncEvent) {
      throw new NotFoundException({
        code: 'SYNC_EVENT_NOT_FOUND',
        message: '동기화 이벤트를 찾을 수 없습니다.',
      });
    }

    // 진행률 계산 (상태 기반)
    let progress = 0;
    switch (syncEvent.status) {
      case 'PENDING':
        progress = 0;
        break;
      case 'PROCESSING':
        progress = 50; // 기본값, 실제 진행률이 있으면 사용
        break;
      case 'DONE':
        progress = 100;
        break;
      case 'FAILED':
        progress = 0;
        break;
    }

    return {
      id: syncEvent.id,
      eventType: syncEvent.eventType,
      targetType: syncEvent.targetType,
      status: syncEvent.status,
      progress,
      retryCount: syncEvent.retryCount,
      errorMessage: syncEvent.errorMessage,
      createdAt: syncEvent.createdAt.toISOString(),
      processedAt: syncEvent.processedAt?.toISOString(),
    };
  }

  /**
   * GET /files/:fileId/sync-status - 파일 동기화 상태 조회
   */
  @Get('files/:fileId/sync-status')
  @ApiFileSyncStatus()
  async getFileSyncStatus(
    @Param('fileId') fileId: string,
  ): Promise<FileSyncStatusResponse> {
    // 파일 존재 확인
    const file = await this.fileRepository.findById(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    // 스토리지 객체 조회
    const cacheObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.CACHE,
    );
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.NAS,
    );

    // 캐시 상태
    const cacheStatus: 'AVAILABLE' | 'MISSING' = 
      cacheObject?.availabilityStatus === 'AVAILABLE' ? 'AVAILABLE' : 'MISSING';

    // NAS 상태
    let nasStatus: 'AVAILABLE' | 'SYNCING' | 'ERROR' = 'SYNCING';
    if (nasObject) {
      switch (nasObject.availabilityStatus) {
        case 'AVAILABLE':
          nasStatus = 'AVAILABLE';
          break;
        case 'SYNCING':
          nasStatus = 'SYNCING';
          break;
        case 'ERROR':
          nasStatus = 'ERROR';
          break;
        default:
          nasStatus = 'SYNCING';
      }
    }

    // 활성 동기화 이벤트 조회
    let activeSyncEvent: FileSyncStatusResponse['activeSyncEvent'] = undefined;
    
    // 파일 ID로 최근 동기화 이벤트 조회
    const syncEvents = await this.syncEventRepository.findByFileId(fileId);
    const activeEvent = syncEvents.find(
      (e) => e.status === 'PENDING' || e.status === 'PROCESSING'
    );
    
    if (activeEvent) {
      let progress = 0;
      if (activeEvent.status === 'PROCESSING') {
        progress = 50; // 기본값
      }

      activeSyncEvent = {
        id: activeEvent.id,
        eventType: activeEvent.eventType,
        status: activeEvent.status,
        progress,
        createdAt: activeEvent.createdAt.toISOString(),
      };
    }

    return {
      fileId,
      storageStatus: {
        cache: cacheStatus,
        nas: nasStatus,
      },
      activeSyncEvent,
    };
  }
}
