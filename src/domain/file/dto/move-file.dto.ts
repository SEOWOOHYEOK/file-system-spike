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
 *
 * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 * 응답: 200 OK (id, name, folderId, path, syncEventId)
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
  /** sync_events 테이블 INSERT 후 반환된 ID (skipped=true인 경우 없음) */
  syncEventId?: string;
}
