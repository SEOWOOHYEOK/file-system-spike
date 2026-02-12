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
  SHARE_DOWNLOAD = 'SHARE_DOWNLOAD', // 공유 파일 다운로드
  SHARE_BLOCK = 'SHARE_BLOCK', // 공유 링크 차단
  SHARE_UNBLOCK = 'SHARE_UNBLOCK', // 공유 링크 차단 해제
  SHARE_BULK_BLOCK = 'SHARE_BULK_BLOCK', // 공유 일괄 차단
  SHARE_BULK_UNBLOCK = 'SHARE_BULK_UNBLOCK', // 공유 일괄 차단 해제

  // 공유 요청 관련
  SHARE_REQUEST_CREATE = 'SHARE_REQUEST_CREATE', // 공유 요청 생성
  SHARE_REQUEST_APPROVE = 'SHARE_REQUEST_APPROVE', // 공유 요청 승인
  SHARE_REQUEST_REJECT = 'SHARE_REQUEST_REJECT', // 공유 요청 거부
  SHARE_REQUEST_CANCEL = 'SHARE_REQUEST_CANCEL', // 공유 요청 취소
  SHARE_REQUEST_BULK_APPROVE = 'SHARE_REQUEST_BULK_APPROVE', // 공유 요청 일괄 승인
  SHARE_REQUEST_BULK_REJECT = 'SHARE_REQUEST_BULK_REJECT', // 공유 요청 일괄 거부

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

  // 외부 사용자 관리
  EXTERNAL_USER_CREATE = 'EXTERNAL_USER_CREATE', // 외부 사용자 생성
  EXTERNAL_USER_UPDATE = 'EXTERNAL_USER_UPDATE', // 외부 사용자 수정
  EXTERNAL_USER_DEACTIVATE = 'EXTERNAL_USER_DEACTIVATE', // 외부 사용자 비활성화
  EXTERNAL_USER_ACTIVATE = 'EXTERNAL_USER_ACTIVATE', // 외부 사용자 활성화
  EXTERNAL_USER_PASSWORD_RESET = 'EXTERNAL_USER_PASSWORD_RESET', // 외부 사용자 비밀번호 초기화

  // 비밀번호 변경
  PASSWORD_CHANGE = 'PASSWORD_CHANGE', // 비밀번호 변경

  // 관리자 작업
  USER_ROLE_ASSIGN = 'USER_ROLE_ASSIGN', // 사용자 Role 부여
  USER_ROLE_REMOVE = 'USER_ROLE_REMOVE', // 사용자 Role 제거
  USER_SYNC = 'USER_SYNC', // Employee → User 동기화
  TOKEN_GENERATE = 'TOKEN_GENERATE', // JWT 토큰 수동 생성
  TOKEN_REFRESH = 'TOKEN_REFRESH', // 토큰 갱신 (리프레시 토큰 로테이션)
  ORG_MIGRATION = 'ORG_MIGRATION', // 조직 데이터 마이그레이션

  // 파일 작업 요청 관련
  FILE_ACTION_REQUEST_MOVE_CREATE = 'FILE_ACTION_REQUEST_MOVE_CREATE', // 파일 이동 요청 생성
  FILE_ACTION_REQUEST_DELETE_CREATE = 'FILE_ACTION_REQUEST_DELETE_CREATE', // 파일 삭제 요청 생성
  FILE_ACTION_REQUEST_CANCEL = 'FILE_ACTION_REQUEST_CANCEL', // 파일 작업 요청 취소
  FILE_ACTION_REQUEST_APPROVE = 'FILE_ACTION_REQUEST_APPROVE', // 파일 작업 요청 승인
  FILE_ACTION_REQUEST_REJECT = 'FILE_ACTION_REQUEST_REJECT', // 파일 작업 요청 반려
  FILE_ACTION_REQUEST_BULK_APPROVE = 'FILE_ACTION_REQUEST_BULK_APPROVE', // 파일 작업 요청 일괄 승인
  FILE_ACTION_REQUEST_BULK_REJECT = 'FILE_ACTION_REQUEST_BULK_REJECT', // 파일 작업 요청 일괄 반려
  FILE_ACTION_REQUEST_INVALIDATED = 'FILE_ACTION_REQUEST_INVALIDATED', // 파일 작업 요청 무효화

  // 외부 사용자 공유 접근
  EXTERNAL_SHARE_DETAIL = 'EXTERNAL_SHARE_DETAIL', // 외부 사용자 공유 상세 조회
  EXTERNAL_SHARE_ACCESS = 'EXTERNAL_SHARE_ACCESS', // 외부 사용자 파일 콘텐츠 접근
  EXTERNAL_SHARE_DOWNLOAD = 'EXTERNAL_SHARE_DOWNLOAD', // 외부 사용자 파일 다운로드

  // === 보안 이벤트 (SecurityEvent 흡수) ===
  LOGIN_SUCCESS = 'LOGIN_SUCCESS', // 로그인 성공
  LOGIN_FAILURE = 'LOGIN_FAILURE', // 로그인 실패
  LOGOUT = 'LOGOUT', // 로그아웃
  TOKEN_EXPIRED = 'TOKEN_EXPIRED', // 토큰 만료
  PERMISSION_DENIED = 'PERMISSION_DENIED', // 권한 거부
  EXPIRED_LINK_ACCESS = 'EXPIRED_LINK_ACCESS', // 만료 링크 접근
  BLOCKED_SHARE_ACCESS = 'BLOCKED_SHARE_ACCESS', // 차단된 공유 접근
  ACCESS_PATTERN_DEVIATION = 'ACCESS_PATTERN_DEVIATION', // 접근 패턴 이탈
  NEW_DEVICE_ACCESS = 'NEW_DEVICE_ACCESS', // 신규 기기 접근
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
  [AuditAction.SHARE_DOWNLOAD]: '공유 파일 다운로드',
  [AuditAction.SHARE_BLOCK]: '공유 링크 차단',
  [AuditAction.SHARE_UNBLOCK]: '공유 링크 차단 해제',
  [AuditAction.SHARE_BULK_BLOCK]: '공유 일괄 차단',
  [AuditAction.SHARE_BULK_UNBLOCK]: '공유 일괄 차단 해제',
  [AuditAction.SHARE_REQUEST_CREATE]: '공유 요청 생성',
  [AuditAction.SHARE_REQUEST_APPROVE]: '공유 요청 승인',
  [AuditAction.SHARE_REQUEST_REJECT]: '공유 요청 거부',
  [AuditAction.SHARE_REQUEST_CANCEL]: '공유 요청 취소',
  [AuditAction.SHARE_REQUEST_BULK_APPROVE]: '공유 요청 일괄 승인',
  [AuditAction.SHARE_REQUEST_BULK_REJECT]: '공유 요청 일괄 거부',
  [AuditAction.PERMISSION_GRANT]: '권한 부여',
  [AuditAction.PERMISSION_REVOKE]: '권한 회수',
  [AuditAction.PERMISSION_CHANGE]: '권한 변경',
  [AuditAction.TRASH_EMPTY]: '휴지통 비우기',
  [AuditAction.TRASH_VIEW]: '휴지통 조회',
  [AuditAction.FAVORITE_ADD]: '즐겨찾기 등록',
  [AuditAction.FAVORITE_REMOVE]: '즐겨찾기 해제',
  [AuditAction.FAVORITE_VIEW]: '즐겨찾기 조회',
  [AuditAction.ACTIVITY_VIEW]: '최근 활동 조회',
  [AuditAction.EXTERNAL_USER_CREATE]: '외부 사용자 생성',
  [AuditAction.EXTERNAL_USER_UPDATE]: '외부 사용자 수정',
  [AuditAction.EXTERNAL_USER_DEACTIVATE]: '외부 사용자 비활성화',
  [AuditAction.EXTERNAL_USER_ACTIVATE]: '외부 사용자 활성화',
  [AuditAction.EXTERNAL_USER_PASSWORD_RESET]: '외부 사용자 비밀번호 초기화',
  [AuditAction.PASSWORD_CHANGE]: '비밀번호 변경',
  [AuditAction.USER_ROLE_ASSIGN]: '사용자 Role 부여',
  [AuditAction.USER_ROLE_REMOVE]: '사용자 Role 제거',
  [AuditAction.USER_SYNC]: 'Employee → User 동기화',
  [AuditAction.TOKEN_GENERATE]: 'JWT 토큰 수동 생성',
  [AuditAction.TOKEN_REFRESH]: '토큰 갱신',
  [AuditAction.ORG_MIGRATION]: '조직 데이터 마이그레이션',
  
  [AuditAction.FILE_ACTION_REQUEST_MOVE_CREATE]: '파일 이동 요청 생성',
  [AuditAction.FILE_ACTION_REQUEST_DELETE_CREATE]: '파일 삭제 요청 생성',
  [AuditAction.FILE_ACTION_REQUEST_CANCEL]: '파일 작업 요청 취소',
  [AuditAction.FILE_ACTION_REQUEST_APPROVE]: '파일 작업 요청 승인',
  [AuditAction.FILE_ACTION_REQUEST_REJECT]: '파일 작업 요청 반려',
  [AuditAction.FILE_ACTION_REQUEST_BULK_APPROVE]: '파일 작업 요청 일괄 승인',
  [AuditAction.FILE_ACTION_REQUEST_BULK_REJECT]: '파일 작업 요청 일괄 반려',
  [AuditAction.FILE_ACTION_REQUEST_INVALIDATED]: '파일 작업 요청 무효화',

  [AuditAction.EXTERNAL_SHARE_DETAIL]: '외부 사용자 공유 상세 조회',
  [AuditAction.EXTERNAL_SHARE_ACCESS]: '외부 사용자 파일 콘텐츠 접근',
  [AuditAction.EXTERNAL_SHARE_DOWNLOAD]: '외부 사용자 파일 다운로드',

  [AuditAction.LOGIN_SUCCESS]: '로그인 성공',
  [AuditAction.LOGIN_FAILURE]: '로그인 실패',
  [AuditAction.LOGOUT]: '로그아웃',
  [AuditAction.TOKEN_EXPIRED]: '토큰 만료',
  [AuditAction.PERMISSION_DENIED]: '권한 거부',
  [AuditAction.EXPIRED_LINK_ACCESS]: '만료 링크 접근',
  [AuditAction.BLOCKED_SHARE_ACCESS]: '차단된 공유 접근',
  [AuditAction.ACCESS_PATTERN_DEVIATION]: '접근 패턴 이탈',
  [AuditAction.NEW_DEVICE_ACCESS]: '신규 기기 접근',
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
  SECURITY = 'security',
  EXTERNAL = 'external',
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
  [AuditAction.SHARE_DOWNLOAD]: ActionCategory.SHARE,
  [AuditAction.SHARE_BLOCK]: ActionCategory.SHARE,
  [AuditAction.SHARE_UNBLOCK]: ActionCategory.SHARE,
  [AuditAction.SHARE_BULK_BLOCK]: ActionCategory.SHARE,
  [AuditAction.SHARE_BULK_UNBLOCK]: ActionCategory.SHARE,
  [AuditAction.SHARE_REQUEST_CREATE]: ActionCategory.SHARE,
  [AuditAction.SHARE_REQUEST_APPROVE]: ActionCategory.SHARE,
  [AuditAction.SHARE_REQUEST_REJECT]: ActionCategory.SHARE,
  [AuditAction.SHARE_REQUEST_CANCEL]: ActionCategory.SHARE,
  [AuditAction.SHARE_REQUEST_BULK_APPROVE]: ActionCategory.SHARE,
  [AuditAction.SHARE_REQUEST_BULK_REJECT]: ActionCategory.SHARE,
  [AuditAction.PERMISSION_GRANT]: ActionCategory.ADMIN,
  [AuditAction.PERMISSION_REVOKE]: ActionCategory.ADMIN,
  [AuditAction.PERMISSION_CHANGE]: ActionCategory.ADMIN,
  [AuditAction.TRASH_EMPTY]: ActionCategory.FILE,
  [AuditAction.TRASH_VIEW]: ActionCategory.FILE,
  [AuditAction.FAVORITE_ADD]: ActionCategory.USER,
  [AuditAction.FAVORITE_REMOVE]: ActionCategory.USER,
  [AuditAction.FAVORITE_VIEW]: ActionCategory.USER,
  [AuditAction.ACTIVITY_VIEW]: ActionCategory.USER,
  [AuditAction.EXTERNAL_USER_CREATE]: ActionCategory.ADMIN,
  [AuditAction.EXTERNAL_USER_UPDATE]: ActionCategory.ADMIN,
  [AuditAction.EXTERNAL_USER_DEACTIVATE]: ActionCategory.ADMIN,
  [AuditAction.EXTERNAL_USER_ACTIVATE]: ActionCategory.ADMIN,
  [AuditAction.EXTERNAL_USER_PASSWORD_RESET]: ActionCategory.ADMIN,
  [AuditAction.PASSWORD_CHANGE]: ActionCategory.SECURITY,
  [AuditAction.USER_ROLE_ASSIGN]: ActionCategory.ADMIN,
  [AuditAction.USER_ROLE_REMOVE]: ActionCategory.ADMIN,
  [AuditAction.USER_SYNC]: ActionCategory.ADMIN,
  [AuditAction.TOKEN_GENERATE]: ActionCategory.SECURITY,
  [AuditAction.TOKEN_REFRESH]: ActionCategory.SECURITY,
  [AuditAction.ORG_MIGRATION]: ActionCategory.ADMIN,
  [AuditAction.FILE_ACTION_REQUEST_MOVE_CREATE]: ActionCategory.FILE,
  [AuditAction.FILE_ACTION_REQUEST_DELETE_CREATE]: ActionCategory.FILE,
  [AuditAction.FILE_ACTION_REQUEST_CANCEL]: ActionCategory.FILE,
  [AuditAction.FILE_ACTION_REQUEST_APPROVE]: ActionCategory.ADMIN,
  [AuditAction.FILE_ACTION_REQUEST_REJECT]: ActionCategory.ADMIN,
  [AuditAction.FILE_ACTION_REQUEST_BULK_APPROVE]: ActionCategory.ADMIN,
  [AuditAction.FILE_ACTION_REQUEST_BULK_REJECT]: ActionCategory.ADMIN,
  [AuditAction.FILE_ACTION_REQUEST_INVALIDATED]: ActionCategory.FILE,

  [AuditAction.EXTERNAL_SHARE_DETAIL]: ActionCategory.EXTERNAL,
  [AuditAction.EXTERNAL_SHARE_ACCESS]: ActionCategory.EXTERNAL,
  [AuditAction.EXTERNAL_SHARE_DOWNLOAD]: ActionCategory.EXTERNAL,

  [AuditAction.LOGIN_SUCCESS]: ActionCategory.SECURITY,
  [AuditAction.LOGIN_FAILURE]: ActionCategory.SECURITY,
  [AuditAction.LOGOUT]: ActionCategory.SECURITY,
  [AuditAction.TOKEN_EXPIRED]: ActionCategory.SECURITY,
  [AuditAction.PERMISSION_DENIED]: ActionCategory.SECURITY,
  [AuditAction.EXPIRED_LINK_ACCESS]: ActionCategory.SECURITY,
  [AuditAction.BLOCKED_SHARE_ACCESS]: ActionCategory.SECURITY,
  [AuditAction.ACCESS_PATTERN_DEVIATION]: ActionCategory.SECURITY,
  [AuditAction.NEW_DEVICE_ACCESS]: ActionCategory.SECURITY,
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
