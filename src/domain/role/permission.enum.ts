export enum PermissionEnum {
  // ── User Management ──────────────────────────────
  USER_READ = 'USER_READ',
  USER_WRITE = 'USER_WRITE',

  // ── Role Management ──────────────────────────────
  ROLE_READ = 'ROLE_READ',
  ROLE_WRITE = 'ROLE_WRITE',

  // ── Audit & Monitoring ───────────────────────────
  /** DMS 이벤트 및 API 로그 조회 */
  AUDIT_READ = 'AUDIT_READ',
  /** 로그 내보내기 */
  AUDIT_EXPORT = 'AUDIT_EXPORT',
  /** NAS 상태 조회, 동기화 현황 조회 */
  SYSTEM_MONITOR = 'SYSTEM_MONITOR',
  /** 저장 용량 임계치 정책 설정 */
  SYSTEM_CONFIG = 'SYSTEM_CONFIG',
  /** NAS 동기화 파일 관제 */
  SYNC_MANAGE = 'SYNC_MANAGE',

  // ── File Management ──────────────────────────────
  FILE_READ = 'FILE_READ',
  FILE_WRITE = 'FILE_WRITE',
  FILE_DELETE = 'FILE_DELETE',
  /** 파일 업로드, 상태 조회, 취소, 재시도, 우선순위 설정 */
  FILE_UPLOAD = 'FILE_UPLOAD',
  /** 파일 다운로드, 미리보기 */
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  /** 파일 직접 이동 (관리자/매니저) */
  FILE_MOVE = 'FILE_MOVE',

  // ── File Request/Approval Workflow ───────────────
  /** 파일 이동 요청, 취소, 목록 조회 */
  FILE_MOVE_REQUEST = 'FILE_MOVE_REQUEST',
  /** 파일 이동 요청 승인/반려 */
  FILE_MOVE_APPROVE = 'FILE_MOVE_APPROVE',
  /** 파일 삭제 요청, 취소, 목록 조회 */
  FILE_DELETE_REQUEST = 'FILE_DELETE_REQUEST',
  /** 파일 삭제 요청 승인/반려 */
  FILE_DELETE_APPROVE = 'FILE_DELETE_APPROVE',

  // ── Trash & Recovery ─────────────────────────────
  /** 삭제 목록 조회 */
  TRASH_READ = 'TRASH_READ',
  /** 파일 영구 삭제 */
  FILE_PURGE = 'FILE_PURGE',
  /** 파일 복구 */
  FILE_RESTORE = 'FILE_RESTORE',

  // ── File Share Management ────────────────────────
  FILE_SHARE_CREATE = 'FILE_SHARE_CREATE',
  FILE_SHARE_READ = 'FILE_SHARE_READ',
  FILE_SHARE_DELETE = 'FILE_SHARE_DELETE',
  /** 공유 직접 생성 (자동승인) */
  FILE_SHARE_DIRECT = 'FILE_SHARE_DIRECT',
  /** 공유 요청 (승인 필요) */
  FILE_SHARE_REQUEST = 'FILE_SHARE_REQUEST',
  /** 외부 공유 요청 승인/반려 */
  FILE_SHARE_APPROVE = 'FILE_SHARE_APPROVE',
  /** 외부 공유 접근 로그 조회 */
  SHARE_LOG_READ = 'SHARE_LOG_READ',

  // ── External Share Access (Guest 포함) ────────────
  /** 나에게 공유된 파일 목록 조회, 공유 상세 조회 */
  EXTERNAL_SHARE_READ = 'EXTERNAL_SHARE_READ',
  /** 공유 파일 뷰어 (인라인 콘텐츠 표시) */
  EXTERNAL_SHARE_VIEW = 'EXTERNAL_SHARE_VIEW',
  /** 공유 파일 다운로드 */
  EXTERNAL_SHARE_DOWNLOAD = 'EXTERNAL_SHARE_DOWNLOAD',

  // ── Folder Management ────────────────────────────
  FOLDER_READ = 'FOLDER_READ',
  FOLDER_WRITE = 'FOLDER_WRITE',
  FOLDER_DELETE = 'FOLDER_DELETE',
}


/**
 * 권한별 한글 설명
 */
export const PermissionDescriptions: Record<PermissionEnum, string> = {
  // User Management
  [PermissionEnum.USER_READ]: '사용자 조회',
  [PermissionEnum.USER_WRITE]: '사용자 생성/수정',

  // Role Management
  [PermissionEnum.ROLE_READ]: '역할 조회',
  [PermissionEnum.ROLE_WRITE]: '역할 생성/수정',

  // Audit & Monitoring
  [PermissionEnum.AUDIT_READ]: 'DMS 이벤트 및 API 로그 조회',
  [PermissionEnum.AUDIT_EXPORT]: '로그 내보내기',
  [PermissionEnum.SYSTEM_MONITOR]: 'NAS 상태 조회 및 동기화 현황',
  [PermissionEnum.SYSTEM_CONFIG]: '저장 용량 임계치 정책 설정',
  [PermissionEnum.SYNC_MANAGE]: 'NAS 동기화 파일 관제',

  // File Management
  [PermissionEnum.FILE_READ]: '파일 조회/검색',
  [PermissionEnum.FILE_WRITE]: '파일 수정',
  [PermissionEnum.FILE_DELETE]: '파일 삭제',
  [PermissionEnum.FILE_UPLOAD]: '파일 업로드/상태 조회/취소/재시도',
  [PermissionEnum.FILE_DOWNLOAD]: '파일 다운로드/미리보기',
  [PermissionEnum.FILE_MOVE]: '파일 직접 이동',

  // Request/Approval Workflow
  [PermissionEnum.FILE_MOVE_REQUEST]: '파일 이동 요청/취소/목록 조회',
  [PermissionEnum.FILE_MOVE_APPROVE]: '파일 이동 요청 승인/반려',
  [PermissionEnum.FILE_DELETE_REQUEST]: '파일 삭제 요청/취소/목록 조회',
  [PermissionEnum.FILE_DELETE_APPROVE]: '파일 삭제 요청 승인/반려',

  // Trash & Recovery
  [PermissionEnum.TRASH_READ]: '삭제 목록 조회',
  [PermissionEnum.FILE_PURGE]: '파일 영구 삭제',
  [PermissionEnum.FILE_RESTORE]: '파일 복구',

  // Share Management
  [PermissionEnum.FILE_SHARE_CREATE]: '파일 공유 생성/설정',
  [PermissionEnum.FILE_SHARE_READ]: '파일 공유 조회',
  [PermissionEnum.FILE_SHARE_DELETE]: '파일 공유 삭제/해제',
  [PermissionEnum.FILE_SHARE_DIRECT]: '파일 공유 직접 생성 (자동승인)',
  [PermissionEnum.FILE_SHARE_REQUEST]: '파일 공유 요청 (승인 필요)',
  [PermissionEnum.FILE_SHARE_APPROVE]: '외부 공유 요청 승인/반려',
  [PermissionEnum.SHARE_LOG_READ]: '외부 공유 접근 로그 조회',
  [PermissionEnum.EXTERNAL_SHARE_READ]: '공유 파일 목록/상세 조회',
  [PermissionEnum.EXTERNAL_SHARE_VIEW]: '공유 파일 뷰어 (인라인 표시)',
  [PermissionEnum.EXTERNAL_SHARE_DOWNLOAD]: '공유 파일 다운로드',

  // Folder Management
  [PermissionEnum.FOLDER_READ]: '폴더 조회/트리/즐겨찾기',
  [PermissionEnum.FOLDER_WRITE]: '폴더 생성/이동/이름 변경',
  [PermissionEnum.FOLDER_DELETE]: '폴더 삭제',
};
