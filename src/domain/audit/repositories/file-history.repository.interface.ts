import { FileHistory } from '../entities/file-history.entity';
import { FileChangeType } from '../enums/file-change.enum';
import { PaginationOptions, PaginatedResult } from './audit-log.repository.interface';

/**
 * 파일 이력 필터 옵션
 */
export interface FileHistoryFilterOptions {
  fileId?: string;
  changeType?: FileChangeType;
  changeTypes?: FileChangeType[];
  changedBy?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 파일 이력 리포지토리 인터페이스
 */
export interface IFileHistoryRepository {
  /**
   * 이력 저장
   */
  save(history: FileHistory): Promise<FileHistory>;

  /**
   * 다수 이력 배치 저장
   */
  saveMany(histories: FileHistory[]): Promise<void>;

  /**
   * ID로 조회
   */
  findById(id: string): Promise<FileHistory | null>;

  /**
   * 필터 조건으로 조회
   */
  findByFilter(
    filter: FileHistoryFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<FileHistory>>;

  /**
   * 파일별 이력 조회 (최신순)
   */
  findByFileId(fileId: string, limit?: number): Promise<FileHistory[]>;

  /**
   * 파일의 특정 버전 조회
   */
  findByFileIdAndVersion(
    fileId: string,
    version: number,
  ): Promise<FileHistory | null>;

  /**
   * 파일의 최신 버전 번호 조회
   */
  getLatestVersion(fileId: string): Promise<number>;

  /**
   * 사용자별 변경 이력 조회
   */
  findByChangedBy(changedBy: string, limit?: number): Promise<FileHistory[]>;
}

export const FILE_HISTORY_REPOSITORY = Symbol('IFileHistoryRepository');
