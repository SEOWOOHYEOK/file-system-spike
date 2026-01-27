/**
 * 파일 공유 권한 enum
 *
 * 공유받은 파일에 대해 수행 가능한 작업 종류
 */
export enum SharePermission {
  /** 뷰어에서 파일 보기만 가능 */
  VIEW = 'VIEW',
  /** 파일 다운로드 가능 */
  DOWNLOAD = 'DOWNLOAD',
}
