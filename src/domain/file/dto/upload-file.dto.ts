/**
 * 파일 업로드 관련 DTO
 */

/**
 * 파일 충돌 전략
 */
export enum ConflictStrategy {
  ERROR = 'ERROR',
  RENAME = 'RENAME',
}

/**
 * 파일 업로드 요청 DTO
 */
export interface UploadFileRequest {
  /** 업로드할 파일 */
  file: Express.Multer.File;
  /** 대상 폴더 ID */
  folderId: string;
  /** 충돌 전략 (기본값: ERROR) */
  conflictStrategy?: ConflictStrategy;
}

/**
 * 파일 업로드 응답 DTO
 *
 * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 * 응답: 200 OK (fileId, name, path, syncEventId)
 */
export interface UploadFileResponse {
  id: string;
  name: string;
  folderId: string;
  path: string;
  size: number;
  mimeType: string;
  storageStatus: {
    cache: 'AVAILABLE';
    nas: 'SYNCING';
  };
  createdAt: string;
  /** sync_events 테이블 INSERT 후 반환된 ID */
  syncEventId: string;
}
