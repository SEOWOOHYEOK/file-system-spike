import { FileActionRequest } from '../entities/file-action-request.entity';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';
import { FileActionType } from '../enums/file-action-type.enum';
import type { PaginationParams, PaginatedResult } from '../../../common/types/pagination';

export interface FileActionRequestFilter {
  status?: FileActionRequestStatus;
  type?: FileActionType;
  requesterId?: string;
  fileId?: string;
  designatedApproverId?: string;
  requestedAtFrom?: Date;
  requestedAtTo?: Date;
}

export interface IFileActionRequestRepository {
  save(request: FileActionRequest): Promise<FileActionRequest>;
  findById(id: string): Promise<FileActionRequest | null>;
  findByFilter(
    filter: FileActionRequestFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FileActionRequest>>;
  findByIds(ids: string[]): Promise<FileActionRequest[]>;
  countByStatus(): Promise<Record<FileActionRequestStatus, number>>;
  /** 같은 파일에 대한 PENDING 요청 조회 (중복 검사용) */
  findPendingByFileId(fileId: string): Promise<FileActionRequest | null>;
  /** 여러 파일에 대한 PENDING 요청 일괄 조회 (파일 목록 조회 시 사용) */
  findPendingByFileIds(fileIds: string[]): Promise<FileActionRequest[]>;
}

export const FILE_ACTION_REQUEST_REPOSITORY = Symbol('FILE_ACTION_REQUEST_REPOSITORY');
