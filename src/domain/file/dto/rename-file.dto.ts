/**
 * 파일명 변경 관련 DTO
 */

import { ConflictStrategy } from './upload-file.dto';

/**
 * 파일명 변경 요청 DTO
 */
export class RenameFileRequest {
  /** 새 파일명 */
  newName: string;
  /** 충돌 전략 (기본값: ERROR) */
  conflictStrategy?: ConflictStrategy;
}

/**
 * 파일명 변경 응답 DTO
 */
export interface RenameFileResponse {
  id: string;
  name: string;
  path: string;
  storageStatus: {
    nas: 'SYNCING';
  };
  updatedAt: string;
}
