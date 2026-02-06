import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SyncEventEntity,
  SyncEventType,
  SyncEventTargetType,
  SyncEventDomainService,
} from '../../../domain/sync-event';
import { SYNC_EVENT_REPOSITORY, type ISyncEventRepository } from '../../../domain/sync-event/repositories/sync-event.repository.interface';
import { JOB_QUEUE_PORT, type IJobQueuePort } from '../../../domain/queue/ports/job-queue.port';
import {
  NAS_FILE_SYNC_QUEUE_PREFIX,
  NasFileSyncJobData,
  NasFileUploadJobData,
  NasFileRenameJobData,
  NasFileMoveJobData,
  NasFileTrashJobData,
  NasFileRestoreJobData,
  NasFilePurgeJobData,
  NasFileAction,
} from '../../worker/nas-file-sync.worker';
import {
  NAS_FOLDER_SYNC_QUEUE_PREFIX,
  NasFolderSyncJobData,
  NasFolderMkdirJobData,
  NasFolderRenameJobData,
  NasFolderMoveJobData,
  NasFolderTrashJobData,
  NasFolderRestoreJobData,
  NasFolderPurgeJobData,
  NasFolderAction,
} from '../../worker/nas-folder-sync.worker';

/**
 * SyncEvent 복구 스케줄러
 * PENDING 상태로 오래 남아있는 SyncEvent를 감지하여 큐에 재등록합니다.
 * 
 * 사용 시나리오:
 * 1. Service에서 SyncEvent 생성 후 addJob 호출 전 프로세스가 죽은 경우
 * 2. addJob 호출이 실패한 경우
 */
@Injectable()
export class SyncEventRecoveryScheduler {
  private readonly logger = new Logger(SyncEventRecoveryScheduler.name);

  /** PENDING 상태로 남아있는 임계 시간 (5분) */
  private readonly STALE_THRESHOLD_MS = 5 * 60 * 1000;

  constructor(
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    private readonly syncEventDomainService: SyncEventDomainService,
  ) { }

  /**
   * 5분마다 PENDING 상태인 SyncEvent 복구
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStalePendingSyncEvents(): Promise<void> {
    try {
      const staleEvents = await this.syncEventRepository.findStalePending(this.STALE_THRESHOLD_MS);

      if (staleEvents.length === 0) {
        return;
      }

      this.logger.log(`Found ${staleEvents.length} stale PENDING SyncEvents, recovering...`);

      for (const event of staleEvents) {
        try {
          await this.recoverSyncEvent(event);
        } catch (error) {
          this.logger.error(`Failed to recover SyncEvent ${event.id}:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to recover stale PENDING SyncEvents:', error);
    }
  }

  /**
   * 개별 SyncEvent 복구
   */
  private async recoverSyncEvent(event: SyncEventEntity): Promise<void> {
    const jobData = this.buildJobDataFromSyncEvent(event);
    const queueName = this.getQueueName(event);

    if (!jobData || !queueName) {
      this.logger.warn(`Cannot build jobData for SyncEvent ${event.id}, skipping`);
      return;
    }

    // 큐에 등록
    await this.jobQueue.addJob(queueName, jobData);

    // QUEUED로 변경
    event.markQueued();
    await this.syncEventDomainService.저장(event);

    this.logger.log(`Recovered SyncEvent ${event.id}: ${event.eventType} ${event.targetType}`);
  }

  /**
   * SyncEvent 타입에 따른 큐 이름 반환
   */
  private getQueueName(event: SyncEventEntity): string | null {
    switch (event.targetType) {
      case SyncEventTargetType.FILE:
        return NAS_FILE_SYNC_QUEUE_PREFIX;
      case SyncEventTargetType.FOLDER:
        return NAS_FOLDER_SYNC_QUEUE_PREFIX;
      default:
        return null;
    }
  }

  /**
   * SyncEvent에서 jobData 재구성
   */
  private buildJobDataFromSyncEvent(event: SyncEventEntity): NasFileSyncJobData | NasFolderSyncJobData | null {
    const metadata = event.metadata || {};

    if (event.targetType === SyncEventTargetType.FILE) {
      return this.buildFileJobData(event, metadata);
    } else if (event.targetType === SyncEventTargetType.FOLDER) {
      return this.buildFolderJobData(event, metadata);
    }

    return null;
  }

  /**
   * 파일 동기화 jobData 생성
   */
  private buildFileJobData(
    event: SyncEventEntity,
    metadata: Record<string, any>,
  ): NasFileSyncJobData | null {
    if (!event.fileId) {
      return null;
    }

    const fileId = event.fileId;
    const syncEventId = event.id;

    switch (event.eventType) {
      case SyncEventType.CREATE: {
        const jobData: NasFileUploadJobData = {
          fileId,
          syncEventId,
          action: 'upload',
        };
        return jobData;
      }

      case SyncEventType.RENAME: {
        const jobData: NasFileRenameJobData = {
          fileId,
          syncEventId,
          action: 'rename',
          oldObjectKey: metadata.oldObjectKey,
          newObjectKey: metadata.newObjectKey,
        };
        return jobData;
      }

      case SyncEventType.MOVE: {
        const jobData: NasFileMoveJobData = {
          fileId,
          syncEventId,
          action: 'move',
          sourcePath: event.sourcePath,
          targetPath: event.targetPath,
          originalFolderId: metadata.originalFolderId,
          targetFolderId: metadata.targetFolderId,
        };
        return jobData;
      }

      case SyncEventType.TRASH: {
        const jobData: NasFileTrashJobData = {
          fileId,
          syncEventId,
          action: 'trash',
          currentObjectKey: metadata.currentObjectKey,
          trashPath: metadata.trashPath,
        };
        return jobData;
      }

      case SyncEventType.RESTORE: {
        const jobData: NasFileRestoreJobData = {
          fileId,
          syncEventId,
          action: 'restore',
          trashMetadataId: metadata.trashMetadataId,
          restoreTargetFolderId: metadata.restoreTargetFolderId,
          userId: metadata.userId,
        };
        return jobData;
      }

      case SyncEventType.PURGE:
      case SyncEventType.DELETE: {
        const jobData: NasFilePurgeJobData = {
          fileId,
          syncEventId,
          action: 'purge',
          trashMetadataId: metadata.trashMetadataId,
          userId: metadata.userId,
        };
        return jobData;
      }

      default:
        return null;
    }
  }

  /**
   * 폴더 동기화 jobData 생성
   */
  private buildFolderJobData(
    event: SyncEventEntity,
    metadata: Record<string, any>,
  ): NasFolderSyncJobData | null {
    if (!event.folderId) {
      return null;
    }

    const folderId = event.folderId;
    const syncEventId = event.id;

    switch (event.eventType) {
      case SyncEventType.CREATE: {
        const jobData: NasFolderMkdirJobData = {
          folderId,
          syncEventId,
          action: 'mkdir',
          path: event.targetPath,
        };
        return jobData;
      }

      case SyncEventType.RENAME: {
        const jobData: NasFolderRenameJobData = {
          folderId,
          syncEventId,
          action: 'rename',
          oldPath: metadata.oldPath,
          newPath: metadata.newPath,
        };
        return jobData;
      }

      case SyncEventType.MOVE: {
        const jobData: NasFolderMoveJobData = {
          folderId,
          syncEventId,
          action: 'move',
          oldPath: metadata.oldPath,
          newPath: metadata.newPath,
          originalParentId: metadata.originalParentId,
          targetParentId: metadata.targetParentId,
        };
        return jobData;
      }

      case SyncEventType.TRASH: {
        const jobData: NasFolderTrashJobData = {
          folderId,
          syncEventId,
          action: 'trash',
          currentPath: metadata.currentPath,
          trashPath: metadata.trashPath,
        };
        return jobData;
      }

      case SyncEventType.RESTORE: {
        const jobData: NasFolderRestoreJobData = {
          folderId,
          syncEventId,
          action: 'restore',
          trashPath: metadata.trashPath,
          restorePath: metadata.restorePath,
          trashMetadataId: metadata.trashMetadataId,
          originalParentId: metadata.originalParentId,
        };
        return jobData;
      }

      case SyncEventType.PURGE:
      case SyncEventType.DELETE: {
        const jobData: NasFolderPurgeJobData = {
          folderId,
          syncEventId,
          action: 'purge',
          trashPath: metadata.trashPath,
          trashMetadataId: metadata.trashMetadataId,
        };
        return jobData;
      }

      default:
        return null;
    }
  }

  /**
   * SyncEventType -> NasFileAction 매핑
   */
  private mapEventTypeToFileAction(eventType: SyncEventType): NasFileAction {
    const mapping: Record<SyncEventType, NasFileAction> = {
      [SyncEventType.CREATE]: 'upload',
      [SyncEventType.RENAME]: 'rename',
      [SyncEventType.MOVE]: 'move',
      [SyncEventType.TRASH]: 'trash',
      [SyncEventType.RESTORE]: 'restore',
      [SyncEventType.PURGE]: 'purge',
      [SyncEventType.DELETE]: 'purge', // DELETE는 PURGE로 매핑
    };
    return mapping[eventType];
  }

  /**
   * SyncEventType -> NasFolderAction 매핑
   */
  private mapEventTypeToFolderAction(eventType: SyncEventType): NasFolderAction {
    const mapping: Record<SyncEventType, NasFolderAction> = {
      [SyncEventType.CREATE]: 'mkdir',
      [SyncEventType.RENAME]: 'rename',
      [SyncEventType.MOVE]: 'move',
      [SyncEventType.TRASH]: 'trash',
      [SyncEventType.RESTORE]: 'restore',
      [SyncEventType.PURGE]: 'purge',
      [SyncEventType.DELETE]: 'purge', // DELETE는 PURGE로 매핑
    };
    return mapping[eventType];
  }
}
