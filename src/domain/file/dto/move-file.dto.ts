/**
 * 파일 이동 관련 DTO
 */

/**
 * 파일 이동 충돌 전략
 */
export enum MoveConflictStrategy {
  ERROR = 'ERROR',
  OVERWRITE = 'OVERWRITE',
  RENAME = 'RENAME',
  SKIP = 'SKIP',
}

/**
 * 파일 이동 요청 DTO
 */
export class MoveFileRequest {
  /** 대상 폴더 ID */
  targetFolderId: string;
  /** 충돌 전략 (기본값: ERROR) */
  conflictStrategy?: MoveConflictStrategy;
}

/**
 * 파일 이동 응답 DTO
 */
export interface MoveFileResponse {
  id: string;
  name: string;
  folderId: string;
  path: string;
  skipped?: boolean;
  reason?: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
}
