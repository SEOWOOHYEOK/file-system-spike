/**
 * 휴지통 복원 관련 DTO
 */

/**
 * 복원 경로 상태
 */
export enum PathStatus {
  /** 경로 존재 */
  AVAILABLE = 'AVAILABLE',
  /** 경로 없음 */
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
}

/**
 * 파일 복원 정보 응답 DTO
 */
export interface FileRestoreInfoResponse {
  trashId: string;
  fileName: string;
  /** 원래 경로 정보 */
  originalPath: string;
  originalFolderId: string;
  /** 경로 상태 */
  pathStatus: PathStatus;
  /** AVAILABLE인 경우 충돌 여부 */
  hasConflict: boolean;
  conflictFileName?: string;
}

/**
 * 폴더 복원 정보 응답 DTO
 */
export interface FolderRestoreInfoResponse {
  trashId: string;
  folderName: string;
  /** 원래 경로 정보 */
  originalPath: string;
  originalParentId: string;
  /** 상위 경로 상태 */
  parentPathStatus: PathStatus;
  /** AVAILABLE인 경우 충돌 여부 */
  hasConflict: boolean;
  conflictFolderId?: string;
  conflictFolderName?: string;
  /** 하위 항목 수 */
  childCount: {
    files: number;
    folders: number;
  };
}

/**
 * 파일 복원 요청 DTO
 */
export class FileRestoreRequest {
  /** 충돌 시 새 파일명 (충돌 있을 때만 필수) */
  newFileName?: string;
}

/**
 * 폴더 복원 전략
 */
export enum FolderRestoreStrategy {
  /** 다른 위치 선택 */
  CHOOSE_LOCATION = 'CHOOSE_LOCATION',
  /** 원래 경로 생성 */
  RECREATE_PATH = 'RECREATE_PATH',
}

/**
 * 폴더 복원 요청 DTO
 */
export class FolderRestoreRequest {
  /** 복원 전략 (PATH_NOT_FOUND인 경우 필수) */
  restoreStrategy?: FolderRestoreStrategy;
  /** CHOOSE_LOCATION인 경우 대상 폴더 ID */
  targetParentId?: string;
  /** 충돌 시 새 폴더명 */
  newFolderName?: string;
}

/**
 * 복원 응답 DTO
 */
export interface RestoreResponse {
  id: string;
  name: string;
  path: string;
  restoredAt: string;
}

/**
 * 전체 복원 응답 DTO
 */
export interface RestoreAllResponse {
  message: string;
  restored: number;
  skipped: number;
  failed: number;
  skippedItems: {
    id: string;
    name: string;
    reason: 'CONFLICT';
    conflictWith: string;
  }[];
}
