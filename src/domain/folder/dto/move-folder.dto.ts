/**
 * 폴더 이동 관련 DTO
 */

/**
 * 폴더 이동 충돌 전략
 */
export enum MoveFolderConflictStrategy {
  ERROR = 'ERROR',
  RENAME = 'RENAME',
  SKIP = 'SKIP',
}

/**
 * 폴더 이동 요청 DTO
 */
export class MoveFolderRequest {
  /** 대상 상위 폴더 ID */
  targetParentId: string;
  /** 충돌 전략 (기본값: ERROR) */
  conflictStrategy?: MoveFolderConflictStrategy;
}

/**
 * 폴더 이동 응답 DTO
 */
export class MoveFolderResponse {
  id: string;
  name: string;
  parentId: string;
  path: string;
  skipped?: boolean;
  reason?: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
}
