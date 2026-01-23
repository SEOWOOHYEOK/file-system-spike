/**
 * 파일 응답 관련 DTO
 */

import { FileState } from '../entities/file.entity';
import { AvailabilityStatus } from '../../storage/file/file-storage-object.entity';

/**
 * 스토리지 상태 DTO
 */
export interface StorageStatusDto {
  cache: AvailabilityStatus | null;
  nas: AvailabilityStatus | null;
}

/**
 * 파일 정보 응답 DTO
 */
export interface FileInfoResponse {
  id: string;
  name: string;
  folderId: string;
  path: string;
  size: number;
  mimeType: string;
  state: FileState;
  storageStatus: StorageStatusDto;
  createdAt: string;
  updatedAt: string;
}

/**
 * 파일 목록 아이템 DTO
 */
export interface FileListItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  storageStatus: StorageStatusDto;
  updatedAt: string;
}
