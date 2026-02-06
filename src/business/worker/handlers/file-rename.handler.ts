/**
 * NAS 파일 이름 변경 핸들러
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  NAS_STORAGE_PORT,
} from '../../../domain/storage/ports/nas-storage.port';
import { AvailabilityStatus } from '../../../domain/file';
import { FileNasStorageDomainService } from '../../../domain/storage/file/service/file-nas-storage-domain.service';
import { SyncEventLifecycleHelper } from '../shared/sync-event-lifecycle.helper';
import type { Job } from '../../../domain/queue/ports/job-queue.port';
import type { INasStoragePort } from '../../../domain/storage/ports/nas-storage.port';
import type { NasFileRenameJobData } from '../nas-file-sync.worker';

@Injectable()
export class FileRenameHandler {
  private readonly logger = new Logger(FileRenameHandler.name);

  constructor(
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly syncEventHelper: SyncEventLifecycleHelper,
  ) {}

  async execute(job: Job<NasFileRenameJobData>): Promise<void> {
    const { fileId, oldObjectKey, newObjectKey, syncEventId } = job.data;
    this.logger.debug(`파일 이름 변경 처리 시작: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);

    const syncEvent = await this.syncEventHelper.getSyncEvent(syncEventId);

    try {
      await this.syncEventHelper.markProcessing(syncEvent);

      const nasObject = await this.fileNasStorageDomainService.조회(fileId);

      if (!nasObject) {
        this.logger.warn(`NAS 스토리지 객체를 찾을 수 없음: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      if (nasObject.isAvailable() && nasObject.objectKey === newObjectKey) {
        this.logger.debug(`이미 NAS에서 이름 변경된 파일: ${fileId}`);
        await this.syncEventHelper.markDone(syncEvent);
        return;
      }

      const targetObjectKey = this.buildRenameTarget(oldObjectKey, newObjectKey);

      try {
        await this.nasStorage.파일이동(oldObjectKey, targetObjectKey);
      } catch (nasError: any) {
        if (nasError.code === 'ENOENT' || nasError.code === 'EEXIST') {
          this.logger.debug(`파일 이름 변경 이미 완료됨 (멱등성): ${oldObjectKey} -> ${targetObjectKey}`);
        } else {
          throw nasError;
        }
      }

      nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
      nasObject.updateObjectKey(targetObjectKey);
      await this.fileNasStorageDomainService.저장(nasObject);

      await this.syncEventHelper.markDone(syncEvent);
      this.logger.log(`NAS 파일 이름 변경 완료: ${fileId}, ${oldObjectKey} -> ${newObjectKey}`);
    } catch (error) {
      this.logger.error(`NAS 파일 이름 변경 실패: ${fileId}`, error);
      await this.syncEventHelper.handleRetry(
        syncEvent,
        error as Error,
        `action=rename | fileId=${fileId}`,
      );
      throw error;
    }
  }

  // ===== 헬퍼 메서드들 =====

  buildRenameTarget(oldObjectKey: string, newObjectKey: string): string {
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
}
