import { Inject, Injectable } from '@nestjs/common';
import { FILE_HISTORY_REPOSITORY } from '../repositories/file-history.repository.interface';
import type {
  FileHistoryFilterOptions,
  IFileHistoryRepository,
} from '../repositories/file-history.repository.interface';
import type {
  PaginatedResult,
  PaginationOptions,
} from '../repositories/audit-log.repository.interface';
import type { FileHistory } from '../entities/file-history.entity';

@Injectable()
export class FileHistoryDomainService {
  constructor(
    @Inject(FILE_HISTORY_REPOSITORY)
    private readonly repository: IFileHistoryRepository,
  ) {}

  async 저장(history: FileHistory): Promise<FileHistory> {
    return this.repository.save(history);
  }

  async 다중저장(histories: FileHistory[]): Promise<void> {
    return this.repository.saveMany(histories);
  }

  async 조회(id: string): Promise<FileHistory | null> {
    return this.repository.findById(id);
  }

  async 필터조회(
    filter: FileHistoryFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<FileHistory>> {
    return this.repository.findByFilter(filter, pagination);
  }

  async 파일별조회(fileId: string, limit?: number): Promise<FileHistory[]> {
    return this.repository.findByFileId(fileId, limit);
  }

  async 파일버전조회(fileId: string, version: number): Promise<FileHistory | null> {
    return this.repository.findByFileIdAndVersion(fileId, version);
  }

  async 최신버전조회(fileId: string): Promise<number> {
    return this.repository.getLatestVersion(fileId);
  }

  async 사용자별조회(changedBy: string, limit?: number): Promise<FileHistory[]> {
    return this.repository.findByChangedBy(changedBy, limit);
  }
}
