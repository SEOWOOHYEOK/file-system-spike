/**
 * 폴더 생성 관련 DTO
 */

/**
 * 폴더 충돌 전략
 */
export enum FolderConflictStrategy {
  ERROR = 'ERROR',
  RENAME = 'RENAME',
}

/**
 * 폴더 생성 요청 DTO
 */
export class CreateFolderRequest {
  /** 폴더 이름 */
  name: string;
  /** 상위 폴더 ID (null = 루트) */
  parentId: string | null;
  /** 충돌 전략 (기본값: ERROR) */
  conflictStrategy?: FolderConflictStrategy;
}

/**
 * 폴더 생성 응답 DTO
 */
export interface CreateFolderResponse {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  createdAt: string;
}
