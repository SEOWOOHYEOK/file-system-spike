import { Injectable } from '@nestjs/common';
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
import { RequestContext } from '../../common/context/request-context';
import { BufferedWriter } from './buffered-writer';

/**
 * FileHistoryService
 *
 * 파일 변경 이력을 관리
 * - BufferedWriter로 이력 버퍼링 (DB 부하 감소)
 * - 파일 무결성 증명용 영구 보관
 * - 버전 관리
 * - RequestContext에서 requestId/traceId를 자동 주입 (호출부 누락 불가)
 */
@Injectable()
export class FileHistoryService extends BufferedWriter<FileHistory> {
  constructor(
    private readonly fileHistoryDomainService: FileHistoryDomainService,
  ) {
    super(FileHistoryService.name, { maxSize: 50, flushIntervalMs: 5000 });
  }

  protected async persistBatch(items: FileHistory[]): Promise<void> {
    await this.fileHistoryDomainService.다중저장(items);
  }

  protected get entityName(): string {
    return '파일 이력';
  }

  // ──────────────────────────────────────────────
  //  상관관계 자동 주입
  // ──────────────────────────────────────────────

  /**
   * 현재 요청 컨텍스트에서 상관관계 필드를 추출.
   * 모든 기록 메서드에서 자동 호출되어, 호출부가 직접 전달할 필요 없음.
   */
  private getCorrelation(): { requestId: string; traceId?: string } {
    return {
      requestId: RequestContext.getRequestId(),
      traceId: RequestContext.getTraceId(),
    };
  }

  // ──────────────────────────────────────────────
  //  기록 API
  // ──────────────────────────────────────────────

  /**
   * 파일 이력 기록 (비동기)
   */
  async log(params: CreateFileHistoryParams): Promise<void> {
    try {
      const correlation = this.getCorrelation();
      const history = FileHistory.create({
        ...params,
        requestId: params.requestId || correlation.requestId,
        traceId: params.traceId || correlation.traceId,
      });
      await this.enqueue(history);
    } catch (error) {
      this.logger.error('파일 이력 기록 실패', error);
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
    const history = FileHistory.createForFileCreated({
      ...params,
      ...this.getCorrelation(),
    });
    await this.enqueue(history);
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
      ...this.getCorrelation(),
    });
    await this.enqueue(history);
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
      ...this.getCorrelation(),
    });
    await this.enqueue(history);
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
      ...this.getCorrelation(),
    });
    await this.enqueue(history);
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
      ...this.getCorrelation(),
    });
    await this.enqueue(history);
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
      ...this.getCorrelation(),
    });
    await this.enqueue(history);
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
      ...this.getCorrelation(),
    });
    await this.enqueue(history);
  }

  /**
   * 즉시 저장
   */
  async logImmediate(params: CreateFileHistoryParams): Promise<FileHistory> {
    const correlation = this.getCorrelation();
    const history = FileHistory.create({
      ...params,
      requestId: params.requestId || correlation.requestId,
      traceId: params.traceId || correlation.traceId,
    });
    return this.fileHistoryDomainService.저장(history);
  }

  // ──────────────────────────────────────────────
  //  조회 API
  // ──────────────────────────────────────────────

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
