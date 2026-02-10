import { Injectable } from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { FileDomainService } from '../../domain/file';
import {
  FileCacheStorageDomainService,
  FileNasStorageDomainService,
} from '../../domain/storage';
import { SyncEventDomainService } from '../../domain/sync-event';

export interface SyncEventStatusResponse {
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

export interface FileSyncStatusResponse {
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

@Injectable()
export class SyncEventQueryService {
  constructor(
    private readonly syncEventDomainService: SyncEventDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
  ) {}

  async getSyncEventStatus(_syncEventId: string): Promise<SyncEventStatusResponse> {
    const syncEvent = await this.syncEventDomainService.조회(_syncEventId);

    if (!syncEvent) {
      throw BusinessException.of(ErrorCodes.SYNC_EVENT_NOT_FOUND, { syncEventId: _syncEventId });
    }

    return {
      id: syncEvent.id,
      eventType: syncEvent.eventType,
      targetType: syncEvent.targetType,
      status: syncEvent.status,
      progress: this.calculateProgress(syncEvent.status),
      retryCount: syncEvent.retryCount,
      errorMessage: syncEvent.errorMessage,
      createdAt: syncEvent.createdAt.toISOString(),
      processedAt: syncEvent.processedAt?.toISOString(),
    };
  }

  async getFileSyncStatus(_fileId: string): Promise<FileSyncStatusResponse> {
    const file = await this.fileDomainService.조회(_fileId);
    if (!file) {
      throw BusinessException.of(ErrorCodes.SYNC_EVENT_FILE_NOT_FOUND, { fileId: _fileId });
    }

    const cacheObject = await this.fileCacheStorageDomainService.조회(_fileId);
    const nasObject = await this.fileNasStorageDomainService.조회(_fileId);

    const cacheStatus: 'AVAILABLE' | 'MISSING' =
      cacheObject?.availabilityStatus === 'AVAILABLE' ? 'AVAILABLE' : 'MISSING';

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

    const syncEvents = await this.syncEventDomainService.파일별조회(_fileId);
    const activeEvent = syncEvents.find(
      (event) => event.status === 'PENDING' || event.status === 'PROCESSING',
    );

    const activeSyncEvent = activeEvent
      ? {
          id: activeEvent.id,
          eventType: activeEvent.eventType,
          status: activeEvent.status,
          progress: activeEvent.status === 'PROCESSING' ? 50 : 0,
          createdAt: activeEvent.createdAt.toISOString(),
        }
      : undefined;

    return {
      fileId: _fileId,
      storageStatus: {
        cache: cacheStatus,
        nas: nasStatus,
      },
      activeSyncEvent,
    };
  }

  private calculateProgress(status: string): number {
    switch (status) {
      case 'PENDING':
        return 0;
      case 'PROCESSING':
        return 50;
      case 'DONE':
        return 100;
      case 'FAILED':
        return 0;
      default:
        return 0;
    }
  }
}
