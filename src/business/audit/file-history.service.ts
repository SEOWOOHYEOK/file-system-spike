import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  FileHistory,
  CreateFileHistoryParams,
} from '../../domain/audit/entities/file-history.entity';
import { FileHistoryDomainService } from '../../domain/audit/service/file-history-domain.service';
import type {
  FileHistoryFilterOptions,
} from '../../domain/audit/repositories/file-history.repository.interface';
import {
  PaginationOptions,
  PaginatedResult,
} from '../../domain/audit/repositories/audit-log.repository.interface';
import { UserType } from '../../domain/audit/enums/common.enum';

/**
 * FileHistoryService
 *
 * 파일 변경 이력을 관리
 * - 파일 무결성 증명용 영구 보관
 * - 버전 관리
 */
@Injectable()
export class FileHistoryService implements OnModuleDestroy {
  private readonly logger = new Logger(FileHistoryService.name);
  private readonly buffer: FileHistory[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly maxBufferSize = 50;
  private readonly flushIntervalMs = 5000;

  constructor(
    private readonly fileHistoryDomainService: FileHistoryDomainService,
  ) {
    this.startAutoFlush();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopAutoFlush();
    await this.flush();
  }

  /**
   * 파일 이력 기록 (비동기)
   */
  async log(params: CreateFileHistoryParams): Promise<void> {
    try {
      const history = FileHistory.create(params);
      this.buffer.push(history);

      if (this.buffer.length >= this.maxBufferSize) {
        await this.flush();
      }
    } catch (error) {
      this.logger.error('Failed to create file history', error);
    }
  }

  /**
   * 파일 생성 이력 기록
   */
  async logFileCreated(params: {
    fileId: string;
    changedBy: string;
    userType: UserType;
    name: string;
    size: number;
    mimeType: string;
    path: string;
    checksum?: string;
  }): Promise<void> {
    const history = FileHistory.createForFileCreated(params);
    this.buffer.push(history);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 파일 이름 변경 이력 기록
   */
  async logFileRenamed(params: {
    fileId: string;
    changedBy: string;
    userType: UserType;
    previousName: string;
    newName: string;
  }): Promise<void> {
    const version = await this.getNextVersion(params.fileId);
    const history = FileHistory.createForRenamed({
      ...params,
      version,
    });
    this.buffer.push(history);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 파일 이동 이력 기록
   */
  async logFileMoved(params: {
    fileId: string;
    changedBy: string;
    userType: UserType;
    previousFolderId: string;
    previousPath: string;
    newFolderId: string;
    newPath: string;
  }): Promise<void> {
    const version = await this.getNextVersion(params.fileId);
    const history = FileHistory.createForMoved({
      ...params,
      version,
    });
    this.buffer.push(history);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 파일 내용 교체 이력 기록
   */
  async logContentReplaced(params: {
    fileId: string;
    changedBy: string;
    userType: UserType;
    previousSize: number;
    newSize: number;
    checksumBefore?: string;
    checksumAfter?: string;
  }): Promise<void> {
    const version = await this.getNextVersion(params.fileId);
    const history = FileHistory.createForContentReplaced({
      ...params,
      version,
    });
    this.buffer.push(history);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 파일 휴지통 이동 이력 기록
   */
  async logFileTrashed(params: {
    fileId: string;
    changedBy: string;
    userType: UserType;
    fileName: string;
    originalPath: string;
  }): Promise<void> {
    const version = await this.getNextVersion(params.fileId);
    const history = FileHistory.createForTrashed({
      ...params,
      version,
    });
    this.buffer.push(history);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 파일 복원 이력 기록
   */
  async logFileRestored(params: {
    fileId: string;
    changedBy: string;
    userType: UserType;
    fileName: string;
    restoredPath: string;
  }): Promise<void> {
    const version = await this.getNextVersion(params.fileId);
    const history = FileHistory.createForRestored({
      ...params,
      version,
    });
    this.buffer.push(history);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 파일 영구 삭제 이력 기록
   */
  async logFileDeleted(params: {
    fileId: string;
    changedBy: string;
    userType: UserType;
    fileName: string;
  }): Promise<void> {
    const version = await this.getNextVersion(params.fileId);
    const history = FileHistory.createForDeleted({
      ...params,
      version,
    });
    this.buffer.push(history);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 즉시 저장
   */
  async logImmediate(params: CreateFileHistoryParams): Promise<FileHistory> {
    const history = FileHistory.create(params);
    return this.fileHistoryDomainService.저장(history);
  }

  /**
   * 버퍼 플러시
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const historiesToSave = [...this.buffer];
    this.buffer.length = 0;

    try {
      await this.fileHistoryDomainService.다중저장(historiesToSave);
      this.logger.debug(`Flushed ${historiesToSave.length} file histories`);
    } catch (error) {
      this.logger.error(
        `Failed to flush ${historiesToSave.length} file histories`,
        error,
      );
      this.buffer.push(...historiesToSave);
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.flushIntervalMs);
  }

  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 다음 버전 번호 조회
   */
  private async getNextVersion(fileId: string): Promise<number> {
    const latestVersion = await this.fileHistoryDomainService.최신버전조회(fileId);
    return latestVersion + 1;
  }

  /**
   * 필터 조건으로 조회
   */
  async findByFilter(
    filter: FileHistoryFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<FileHistory>> {
    return this.fileHistoryDomainService.필터조회(filter, pagination);
  }

  /**
   * 파일별 이력 조회
   */
  async findByFileId(fileId: string, limit?: number): Promise<FileHistory[]> {
    return this.fileHistoryDomainService.파일별조회(fileId, limit);
  }

  /**
   * 파일의 특정 버전 조회
   */
  async findByFileIdAndVersion(
    fileId: string,
    version: number,
  ): Promise<FileHistory | null> {
    return this.fileHistoryDomainService.파일버전조회(fileId, version);
  }

  /**
   * 사용자별 변경 이력 조회
   */
  async findByChangedBy(changedBy: string, limit?: number): Promise<FileHistory[]> {
    return this.fileHistoryDomainService.사용자별조회(changedBy, limit);
  }
}
