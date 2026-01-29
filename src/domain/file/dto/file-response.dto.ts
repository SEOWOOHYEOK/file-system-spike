/**
 * 파일 응답 관련 DTO
 */

import { FileState } from '../type/file.type';
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

/**
 * 파일 삭제(휴지통 이동) 응답 DTO
 *
 * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 * 응답: 200 OK (id, name, state=TRASHED, syncEventId)
 */
export interface DeleteFileResponse {
  id: string;
  name: string;
  state: FileState;
  trashedAt: string;
  /** sync_events 테이블 INSERT 후 반환된 ID */
  syncEventId: string;
}
