/**
 * 파일 응답 관련 DTO
 */

import { FileState } from '../type/file.type';
import { AvailabilityStatus } from '../../storage/file/entity/file-storage-object.entity';

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
  /** 파일 생성자 (업로더) ID */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** 파일 체크섬 (SHA-256) - 병렬 다운로드 후 무결성 검증용 */
  checksum: string | null;
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
  /** 파일 크기 (bytes) */
  size: number;
  /** MIME 타입 */
  mimeType: string;
  /** 파일 생성자 (업로더) ID - 감사 로그 ownerId 매핑용 */
  createdBy: string;
  /** 삭제 전 파일 경로 */
  path: string;
  state: FileState;
  trashedAt: string;
  /** sync_events 테이블 INSERT 후 반환된 ID */
  syncEventId: string;
}
