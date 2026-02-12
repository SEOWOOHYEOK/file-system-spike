import { Inject, Injectable } from '@nestjs/common';
import { FileActionRequest } from '../entities/file-action-request.entity';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';
import {
  FILE_ACTION_REQUEST_REPOSITORY,
  type IFileActionRequestRepository,
  type FileActionRequestFilter,
} from '../repositories/file-action-request.repository.interface';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';

@Injectable()
export class FileActionRequestDomainService {
  constructor(
    @Inject(FILE_ACTION_REQUEST_REPOSITORY)
    private readonly repository: IFileActionRequestRepository,
  ) {}

  async 저장(request: FileActionRequest): Promise<FileActionRequest> {
    return this.repository.save(request);
  }

  async 조회(id: string): Promise<FileActionRequest | null> {
    return this.repository.findById(id);
  }

  async 필터조회(
    filter: FileActionRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FileActionRequest>> {
    return this.repository.findByFilter(filter, pagination);
  }

  async 다건조회(ids: string[]): Promise<FileActionRequest[]> {
    return this.repository.findByIds(ids);
  }

  async 상태별카운트(): Promise<Record<FileActionRequestStatus, number>> {
    return this.repository.countByStatus();
  }

  async 파일PENDING조회(fileId: string): Promise<FileActionRequest | null> {
    return this.repository.findPendingByFileId(fileId);
  }

  async 다건파일PENDING조회(fileIds: string[]): Promise<FileActionRequest[]> {
    return this.repository.findPendingByFileIds(fileIds);
  }
}
