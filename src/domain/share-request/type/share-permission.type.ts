/**
 * 공유 권한 타입 열거형
 */
export enum SharePermissionType {
  /** 뷰만 가능 */
  VIEW = 'VIEW',
  /** 다운로드 가능 */
  DOWNLOAD = 'DOWNLOAD',
}

/**
 * 권한 인터페이스
 */
export interface Permission {
  /** 권한 타입 */
  type: SharePermissionType;
  /** 최대 다운로드 횟수 (DOWNLOAD 권한일 때만 사용, 선택적) */
  maxDownloads?: number;
}
