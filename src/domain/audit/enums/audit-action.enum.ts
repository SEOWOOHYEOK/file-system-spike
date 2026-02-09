/**
 * 감사 행위 타입
 *
 * 사용자가 시스템에서 수행하는 모든 행위를 분류
 */
export enum AuditAction {
  // 파일 관련
  FILE_VIEW = 'FILE_VIEW', // 파일 조회
  FILE_DOWNLOAD = 'FILE_DOWNLOAD', // 파일 다운로드
  FILE_UPLOAD = 'FILE_UPLOAD', // 파일 업로드
  FILE_RENAME = 'FILE_RENAME', // 파일 이름 변경
  FILE_MOVE = 'FILE_MOVE', // 파일 이
  FILE_DELETE = 'FILE_DELETE', // 파일 삭제 (휴지통 이동)
  FILE_RESTORE = 'FILE_RESTORE', // 파일 복원
  FILE_PURGE = 'FILE_PURGE', // 파일 영구 삭제

  // 폴더 관련
  FOLDER_CREATE = 'FOLDER_CREATE', // 폴더 생성
  FOLDER_VIEW = 'FOLDER_VIEW', // 폴더 조회
  FOLDER_RENAME = 'FOLDER_RENAME', // 폴더 이름 변경
  FOLDER_MOVE = 'FOLDER_MOVE', // 폴더 이동
  FOLDER_DELETE = 'FOLDER_DELETE', // 폴더 삭제

  // 공유 관련
  SHARE_CREATE = 'SHARE_CREATE', // 공유 링크 생성
  SHARE_REVOKE = 'SHARE_REVOKE', // 공유 링크 해제
  SHARE_ACCESS = 'SHARE_ACCESS', // 공유 링크 접근
  SHARE_BLOCK = 'SHARE_BLOCK', // 공유 링크 차단

  // 권한 관련
  PERMISSION_GRANT = 'PERMISSION_GRANT', // 권한 부여
  PERMISSION_REVOKE = 'PERMISSION_REVOKE', // 권한 회수
  PERMISSION_CHANGE = 'PERMISSION_CHANGE', // 권한 변경

  // 휴지통 관련
  TRASH_EMPTY = 'TRASH_EMPTY', // 휴지통 비우기
  TRASH_VIEW = 'TRASH_VIEW', // 휴지통 조회

  // 즐겨찾기 관련
  FAVORITE_ADD = 'FAVORITE_ADD', // 즐겨찾기 등록
  FAVORITE_REMOVE = 'FAVORITE_REMOVE', // 즐겨찾기 해제
  FAVORITE_VIEW = 'FAVORITE_VIEW', // 즐겨찾기 조회

  // 사용자 활동 관련
  ACTIVITY_VIEW = 'ACTIVITY_VIEW', // 최근 활동 조회
}

/**
 * 감사 행위 한국어 설명
 */
export const AuditActionDescription: Record<AuditAction, string> = {
  [AuditAction.FILE_VIEW]: '파일 조회',
  [AuditAction.FILE_DOWNLOAD]: '파일 다운로드',
  [AuditAction.FILE_UPLOAD]: '파일 업로드',
  [AuditAction.FILE_RENAME]: '파일 이름 변경',
  [AuditAction.FILE_MOVE]: '파일 이동',
  [AuditAction.FILE_DELETE]: '파일 삭제',
  [AuditAction.FILE_RESTORE]: '파일 복원',
  [AuditAction.FILE_PURGE]: '파일 영구 삭제',
  [AuditAction.FOLDER_CREATE]: '폴더 생성',
  [AuditAction.FOLDER_VIEW]: '폴더 조회',
  [AuditAction.FOLDER_RENAME]: '폴더 이름 변경',
  [AuditAction.FOLDER_MOVE]: '폴더 이동',
  [AuditAction.FOLDER_DELETE]: '폴더 삭제',
  [AuditAction.SHARE_CREATE]: '공유 링크 생성',
  [AuditAction.SHARE_REVOKE]: '공유 링크 해제',
  [AuditAction.SHARE_ACCESS]: '공유 링크 접근',
  [AuditAction.SHARE_BLOCK]: '공유 링크 차단',
  [AuditAction.PERMISSION_GRANT]: '권한 부여',
  [AuditAction.PERMISSION_REVOKE]: '권한 회수',
  [AuditAction.PERMISSION_CHANGE]: '권한 변경',
  [AuditAction.TRASH_EMPTY]: '휴지통 비우기',
  [AuditAction.TRASH_VIEW]: '휴지통 조회',
  [AuditAction.FAVORITE_ADD]: '즐겨찾기 등록',
  [AuditAction.FAVORITE_REMOVE]: '즐겨찾기 해제',
  [AuditAction.FAVORITE_VIEW]: '즐겨찾기 조회',
  [AuditAction.ACTIVITY_VIEW]: '최근 활동 조회',
};

/**
 * 행위 카테고리
 */
export enum ActionCategory {
  FILE = 'file',
  FOLDER = 'folder',
  SHARE = 'share',
  AUTH = 'auth',
  ADMIN = 'admin',
  USER = 'user',
}

/**
 * 행위별 카테고리 매핑
 */
export const AuditActionCategory: Record<AuditAction, ActionCategory> = {
  [AuditAction.FILE_VIEW]: ActionCategory.FILE,
  [AuditAction.FILE_DOWNLOAD]: ActionCategory.FILE,
  [AuditAction.FILE_UPLOAD]: ActionCategory.FILE,
  [AuditAction.FILE_RENAME]: ActionCategory.FILE,
  [AuditAction.FILE_MOVE]: ActionCategory.FILE,
  [AuditAction.FILE_DELETE]: ActionCategory.FILE,
  [AuditAction.FILE_RESTORE]: ActionCategory.FILE,
  [AuditAction.FILE_PURGE]: ActionCategory.FILE,
  [AuditAction.FOLDER_CREATE]: ActionCategory.FOLDER,
  [AuditAction.FOLDER_VIEW]: ActionCategory.FOLDER,
  [AuditAction.FOLDER_RENAME]: ActionCategory.FOLDER,
  [AuditAction.FOLDER_MOVE]: ActionCategory.FOLDER,
  [AuditAction.FOLDER_DELETE]: ActionCategory.FOLDER,
  [AuditAction.SHARE_CREATE]: ActionCategory.SHARE,
  [AuditAction.SHARE_REVOKE]: ActionCategory.SHARE,
  [AuditAction.SHARE_ACCESS]: ActionCategory.SHARE,
  [AuditAction.SHARE_BLOCK]: ActionCategory.SHARE,
  [AuditAction.PERMISSION_GRANT]: ActionCategory.ADMIN,
  [AuditAction.PERMISSION_REVOKE]: ActionCategory.ADMIN,
  [AuditAction.PERMISSION_CHANGE]: ActionCategory.ADMIN,
  [AuditAction.TRASH_EMPTY]: ActionCategory.FILE,
  [AuditAction.TRASH_VIEW]: ActionCategory.FILE,
  [AuditAction.FAVORITE_ADD]: ActionCategory.USER,
  [AuditAction.FAVORITE_REMOVE]: ActionCategory.USER,
  [AuditAction.FAVORITE_VIEW]: ActionCategory.USER,
  [AuditAction.ACTIVITY_VIEW]: ActionCategory.USER,
};



// {
//   "id": "log_123",
//   "occurredAt": "2025-02-09T09:30:19+09:00",

//   "eventName": "파일 다운로드",
//   "eventType": "FILE_OPERATION",
//   "result": "SUCCESS",

//   "actor": {
//     "id": "u_9",
//     "name": "김철수",
//     "ip": "192.168.1.10",
//     "userAgent": "Chrome/121.0"
//   },

//   "resource": {
//     "type": "FILE",
//     "id": "f_101",
//     "name": "프로젝트_제안서_v2.pdf"
//   },

//   "api": {
//     "method": "GET",
//     "path": "/api/files/download",
//     "statusCode": 200
//   },

//   "message": "사용자가 파일을 다운로드했습니다."
// }
