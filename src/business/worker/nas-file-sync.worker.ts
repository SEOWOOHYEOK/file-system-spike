import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  JOB_QUEUE_PORT,
  Job,
} from '../../domain/queue/ports/job-queue.port';
import {
  CACHE_STORAGE_PORT,
} from '../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
} from '../../domain/storage/ports/nas-storage.port';
import {
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
  StorageType,
  AvailabilityStatus,
} from '../../domain/file';
import { FOLDER_REPOSITORY } from '../../domain/folder';
import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import { SyncEventEntity } from '../../domain/sync-event/entities/sync-event.entity';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IFileRepository, IFileStorageObjectRepository } from '../../domain/file';
import type { IFolderRepository } from '../../domain/folder';
import type { ISyncEventRepository } from '../../domain/sync-event/repositories/sync-event.repository.interface';



/**
 * NAS 동기화 Job 데이터 타입들
 * syncEventId: SyncEvent 상태 추적용 (선택적, 하위 호환성)
 */
export interface NasSyncUploadJobData {
  fileId: string;
  syncEventId?: string;
}

export interface NasSyncRenameJobData {
  fileId: string;
  oldObjectKey: string;
  newObjectKey: string;
  syncEventId?: string;
}

export interface NasSyncMoveJobData {
  fileId: string;
  sourcePath: string;
  targetPath: string;
  originalFolderId: string;
  targetFolderId: string;
  syncEventId?: string;
}

export interface NasMoveToTrashJobData {
  fileId: string;
  currentObjectKey: string;
  trashPath: string;
  syncEventId?: string;
}

@Injectable()
export class NasSyncWorker implements OnModuleInit {
  private readonly logger = new Logger(NasSyncWorker.name);

  constructor(
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
  ) { }

  /**
   * SyncEvent 조회 (없으면 null)
   */
  private async getSyncEvent(syncEventId?: string): Promise<SyncEventEntity | null> {
    if (!syncEventId) return null;
    return this.syncEventRepository.findById(syncEventId);
  }

  /**
   * SyncEvent 처리 시작 (PROCESSING)
   */
  private async markSyncEventProcessing(syncEvent: SyncEventEntity | null): Promise<void> {
    if (!syncEvent) return;
    syncEvent.startProcessing();
    await this.syncEventRepository.save(syncEvent);
  }

  /**
   * SyncEvent 성공 완료 (DONE)
   */
  private async markSyncEventDone(syncEvent: SyncEventEntity | null): Promise<void> {
    if (!syncEvent) return;
    syncEvent.complete();
    await this.syncEventRepository.save(syncEvent);
  }

  /**
   * SyncEvent 실패 처리 (retry 또는 FAILED)
   */
  private async handleSyncEventFailure(
    syncEvent: SyncEventEntity | null,
    error: Error,
  ): Promise<void> {
    if (!syncEvent) return;
    syncEvent.retry(error.message);
    await this.syncEventRepository.save(syncEvent);
  }

  async onModuleInit() {
    this.logger.log('Registering NAS sync job processors...');

    // 파일 업로드 동기화
    await this.jobQueue.processJobs('NAS_SYNC_UPLOAD', this.processUploadJob.bind(this));

    // 파일명 변경 동기화
    await this.jobQueue.processJobs('NAS_SYNC_RENAME', this.processRenameJob.bind(this));

    // 파일 이동 동기화
    await this.jobQueue.processJobs('NAS_SYNC_MOVE', this.processMoveJob.bind(this));

    // 파일 휴지통 이동
    await this.jobQueue.processJobs('NAS_MOVE_TO_TRASH', this.processTrashJob.bind(this));

    this.logger.log('All NAS sync job processors registered');
  }

  /**
   * NAS 동기화 작업 처리
   */
  private async processUploadJob(job: Job<NasSyncUploadJobData>): Promise<void> {
    const { fileId, syncEventId } = job.data;
    this.logger.debug(`Processing NAS sync for file: ${fileId}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    this.logger.debug(`SyncEvent: ${syncEvent}`);
    this.logger.debug(`SyncEventId: ${syncEventId}`);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. NAS 스토리지 객체 조회
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent); // 이미 삭제된 경우 완료 처리
        return;
      }

      if (nasObject.isAvailable()) {
        this.logger.debug(`File already synced to NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. 파일 정보 조회 (확장자 추출용)
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        this.logger.warn(`File not found: ${fileId}`);
        await this.markSyncEventDone(syncEvent); // 이미 삭제된 경우 완료 처리
        return;
      }

      // 3. 캐시에서 파일 읽기 (스트림)
      const readStream = await this.cacheStorage.파일스트림읽기(fileId);

      // 4. NAS에 파일 쓰기 (스트림)
      // objectKey는 fileId + 확장자 형태로 생성 (파일명에서 확장자 추출)
      const extension = path.extname(file.name); // 예: ".txt", ".pdf"
      // const objectKey = extension ? `${file.createdAt.getTime()}_${file.name}` : fileId;
      const objectKey = syncEvent?.targetPath || fileId;
      await this.nasStorage.파일스트림쓰기(objectKey, readStream);

      // 5. 상태 업데이트
      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(objectKey);
      await this.fileStorageObjectRepository.save(nasObject);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully synced file to NAS: ${fileId} -> ${objectKey}`);
    } catch (error) {
      this.logger.error(`Failed to sync file to NAS: ${fileId}`, error);

      // SyncEvent 실패 처리
      await this.handleSyncEventFailure(syncEvent, error as Error);

      // 큐 시스템이 재시도하도록 에러 전파
      throw error;
    }
  }

  /**
   * NAS 파일명 변경 작업 처리
   */
  private async processRenameJob(job: Job<NasSyncRenameJobData>): Promise<void> {
    const { fileId, oldObjectKey, newObjectKey, syncEventId } = job.data;
    this.logger.debug(`Processing NAS rename for file: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. NAS 스토리지 객체 조회
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 이미 완료된 경우 스킵
      if (nasObject.isAvailable() && nasObject.objectKey === newObjectKey) {
        this.logger.debug(`File already renamed in NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. NAS에서 파일 이름 변경
      const targetObjectKey = this.buildRenameTarget(oldObjectKey, newObjectKey);
      await this.nasStorage.파일이동(oldObjectKey, targetObjectKey);

      // 3. 상태 업데이트
      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetObjectKey);
      await this.fileStorageObjectRepository.save(nasObject);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully renamed file in NAS: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);
    } catch (error) {
      this.logger.error(`Failed to rename file in NAS: ${fileId}`, error);
      await this.handleSyncEventFailure(syncEvent, error as Error);
      throw error;
    }
  }

  /**
   * rename 대상 objectKey 계산
   * - 기존 타임스탬프(prefix)를 유지
   * - 새 파일명만 교체
   */
  private buildRenameTarget(oldObjectKey: string, newObjectKey: string): string {
    const oldDir = path.posix.dirname(oldObjectKey);
    const oldBase = path.posix.basename(oldObjectKey);
    const newBase = path.posix.basename(newObjectKey);

    const { prefix: oldPrefix, separator: oldSep } = this.parseTimestampPrefix(oldBase);
    const newFileName = this.extractFileName(newBase);
    const targetBase = oldPrefix ? `${oldPrefix}${oldSep}${newFileName}` : newFileName;

    return oldDir === '.' ? targetBase : path.posix.join(oldDir, targetBase);
  }

  private parseTimestampPrefix(fileName: string): { prefix: string | null; separator: string } {
    if (fileName.includes('__')) {
      const [prefix] = fileName.split('__');
      return { prefix, separator: '__' };
    }
    const underscoreIndex = fileName.indexOf('_');
    if (underscoreIndex > 0) {
      const prefix = fileName.substring(0, underscoreIndex);
      if (/^\d{10,}$/.test(prefix)) {
        return { prefix, separator: '_' };
      }
    }
    return { prefix: null, separator: '_' };
  }

  private extractFileName(fileName: string): string {
    if (fileName.includes('__')) {
      return fileName.split('__').slice(1).join('__');
    }
    const underscoreIndex = fileName.indexOf('_');
    if (underscoreIndex > 0) {
      const prefix = fileName.substring(0, underscoreIndex);
      if (/^\d{10,}$/.test(prefix)) {
        return fileName.substring(underscoreIndex + 1);
      }
    }
    return fileName;
  }

  /**
   * NAS 파일 이동 작업 처리
   * 
   * 2차 방어: 대상 폴더가 삭제된 경우 원복 처리
   */
  private async processMoveJob(job: Job<NasSyncMoveJobData>): Promise<void> {
    const { fileId, sourcePath, targetPath, originalFolderId, targetFolderId, syncEventId } = job.data;
    this.logger.debug(`Processing NAS move for file: ${fileId}, ${sourcePath} -> ${targetPath}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. NAS 스토리지 객체 조회
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 이미 완료된 경우 스킵
      if (nasObject.isAvailable() && nasObject.objectKey === targetPath) {
        this.logger.debug(`File already moved in NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. 2차 방어: 대상 폴더 존재 여부 확인
      const targetFolder = await this.folderRepository.findById(targetFolderId);

      if (!targetFolder || !targetFolder.isActive()) {
        // 대상 폴더가 삭제됨 - 원복 처리
        this.logger.warn(`Target folder deleted, reverting file move: ${fileId}`);

        // 파일의 folderId를 원래 폴더로 원복
        const file = await this.fileRepository.findById(fileId);
        if (file) {
          file.moveTo(originalFolderId);
          await this.fileRepository.save(file);
        }

        // NAS 상태를 AVAILABLE로 변경 (이동하지 않음)
        nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileStorageObjectRepository.save(nasObject);

        // SyncEvent 완료 (원복도 성공적인 처리)
        await this.markSyncEventDone(syncEvent);

        this.logger.warn(`File move reverted due to deleted target folder: ${fileId}`);
        return;
      }

      // 3. NAS에서 파일 이동
      await this.nasStorage.파일이동(sourcePath, targetPath);

      // 4. 상태 업데이트
      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetPath);
      await this.fileStorageObjectRepository.save(nasObject);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully moved file in NAS: ${fileId}, ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      this.logger.error(`Failed to move file in NAS: ${fileId}`, error);
      await this.handleSyncEventFailure(syncEvent, error as Error);
      throw error;
    }
  }

  /**
   * NAS 휴지통 이동 작업 처리
   * 
   * 2차 방어: lease_count 체크 (다운로드 중이면 재시도)
   */
  private async processTrashJob(job: Job<NasMoveToTrashJobData>): Promise<void> {
    const { fileId, currentObjectKey, trashPath, syncEventId } = job.data;
    this.logger.debug(`Processing NAS trash move for file: ${fileId}, ${currentObjectKey} -> ${trashPath}`);

    // SyncEvent 조회 (선택적)
    const syncEvent = await this.getSyncEvent(syncEventId);

    try {
      // SyncEvent 처리 시작
      await this.markSyncEventProcessing(syncEvent);

      // 1. NAS 스토리지 객체 조회
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
      );

      if (!nasObject) {
        this.logger.warn(`NAS storage object not found for file: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 이미 완료된 경우 스킵
      if (nasObject.isAvailable() && nasObject.objectKey === trashPath) {
        this.logger.debug(`File already moved to trash in NAS: ${fileId}`);
        await this.markSyncEventDone(syncEvent);
        return;
      }

      // 2. 2차 방어: lease_count 체크 (다운로드 중 여부)
      if (nasObject.leaseCount > 0) {
        this.logger.warn(`File is being downloaded, retrying later: ${fileId}, leaseCount: ${nasObject.leaseCount}`);
        // 에러를 던져서 큐 시스템이 재시도하도록 함 (backoff 적용됨)
        throw new Error(`FILE_IN_USE: leaseCount=${nasObject.leaseCount}`);
      }

      // 3. NAS에서 휴지통으로 이동
      await this.nasStorage.파일이동(currentObjectKey, trashPath);

      // 4. 상태 업데이트
      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(trashPath);
      await this.fileStorageObjectRepository.save(nasObject);

      // SyncEvent 완료
      await this.markSyncEventDone(syncEvent);

      this.logger.log(`Successfully moved file to trash in NAS: ${fileId}, ${currentObjectKey} -> ${trashPath}`);
    } catch (error) {
      this.logger.error(`Failed to move file to trash in NAS: ${fileId}`, error);
      await this.handleSyncEventFailure(syncEvent, error as Error);
      throw error;
    }
  }
}
