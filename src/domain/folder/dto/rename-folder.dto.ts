/**
 * 폴더명 변경 관련 DTO
 */

import { FolderConflictStrategy } from './create-folder.dto';

/**
 * 폴더명 변경 요청 DTO
 */
export class RenameFolderRequest {
  /** 새 폴더명 */
  newName: string;
  /** 충돌 전략 (기본값: ERROR) */
  conflictStrategy?: FolderConflictStrategy;
}

/**
 * 폴더명 변경 응답 DTO
 */
export class RenameFolderResponse {
  id: string;
  name: string;
  path: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
}
