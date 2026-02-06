/**
 * 업로드 세션 상태
 */
export enum UploadSessionStatus {
  /** 초기화됨 - 세션 생성 직후 */
  INIT = 'INIT',
  /** 업로드 중 - 파트 업로드 진행 중 */
  UPLOADING = 'UPLOADING',
  /** 병합 중 - 파트 업로드 완료, NAS sync + 캐시 concat 진행 중 */
  COMPLETING = 'COMPLETING',
  /** 완료 - 모든 파트 업로드 및 병합 완료 */
  COMPLETED = 'COMPLETED',
  /** 취소됨 - 사용자가 업로드 취소 */
  ABORTED = 'ABORTED',
  /** 만료됨 - 세션 만료 시간 초과 */
  EXPIRED = 'EXPIRED',
}

/**
 * 업로드 파트 상태
 */
export enum UploadPartStatus {
  /** 대기 중 - 아직 업로드되지 않음 */
  PENDING = 'PENDING',
  /** 업로드 중 */
  UPLOADING = 'UPLOADING',
  /** 완료 - 업로드 성공 */
  COMPLETED = 'COMPLETED',
  /** 실패 - 업로드 실패 */
  FAILED = 'FAILED',
}

/**
 * 기본 파트 크기 (10MB)
 */
export const DEFAULT_PART_SIZE = 10 * 1024 * 1024;

/**
 * 최소 파트 크기 (5MB)
 */
export const MIN_PART_SIZE = 5 * 1024 * 1024;

/**
 * 최대 파트 크기 (100MB)
 */
export const MAX_PART_SIZE = 100 * 1024 * 1024;

/**
 * 세션 만료 시간 (24시간, 밀리초)
 */
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * 멀티파트 업로드 최소 파일 크기 (100MB)
 * 이 크기 이상의 파일만 멀티파트 업로드 사용
 */
export const MULTIPART_MIN_FILE_SIZE = 100 * 1024 * 1024;
