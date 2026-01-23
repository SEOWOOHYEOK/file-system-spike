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
}
