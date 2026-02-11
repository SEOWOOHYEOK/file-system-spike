/**
 * 에러 코드 정의
 *
 * 도메인별로 숫자 코드 범위를 할당합니다:
 * - 1000~1999: File 도메인
 * - 2000~2099: Share/ShareRequest 도메인
 * - 2100~2199: External Share/Auth 도메인
 * - 3000~3999: Auth/Account 도메인
 * - 4000~4999: Folder 도메인
 * - 5000~5999: Trash 도메인
 * - 6000~6999: Favorite 도메인
 * - 7000~7999: Role 도메인
 * - 8000~8999: User 도메인
 * - 9000~9099: SyncEvent 도메인
 * - 9900~9999: System/Other
 */

/**
 * 에러 코드 정의 인터페이스
 */
export interface ErrorCodeDefinition {
  /** 숫자 에러 코드 */
  code: number;
  /** 내부 식별자 (영문 대문자) */
  internalCode: string;
  /** HTTP 상태 코드 */
  httpStatus: number;
  /** 기본 메시지 (한국어) */
  defaultMessage: string;
}

/**
 * 에러 코드 상수
 */
export const ErrorCodes = {
  // ─── File 도메인 (1000~1999) ───

  FILE_NOT_FOUND: {
    code: 1001,
    internalCode: 'FILE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '파일을 찾을 수 없습니다.',
  },

  // Share/ShareRequest 도메인 (2000~2999)
  SHARE_PERMISSION_DENIED: {
    code: 2001,
    internalCode: 'SHARE_PERMISSION_DENIED',
    httpStatus: 403,
    defaultMessage: '파일 공유 권한이 없습니다.',
  },

  SHARE_INACTIVE_USER: {
    code: 2002,
    internalCode: 'SHARE_INACTIVE_USER',
    httpStatus: 403,
    defaultMessage: '비활성 사용자는 요청을 생성할 수 없습니다.',
  },

  SHARE_NO_ROLE: {
    code: 2003,
    internalCode: 'SHARE_NO_ROLE',
    httpStatus: 403,
    defaultMessage: '권한이 없습니다.',
  },

  SHARE_ACTIVE_EXISTS: {
    code: 2004,
    internalCode: 'SHARE_ACTIVE_EXISTS',
    httpStatus: 409,
    defaultMessage: '이미 활성 공유가 존재합니다.',
  },

  SHARE_PENDING_EXISTS: {
    code: 2005,
    internalCode: 'SHARE_PENDING_EXISTS',
    httpStatus: 409,
    defaultMessage: '대기 중인 요청이 존재합니다.',
  },

  SHARE_REQUEST_NOT_FOUND: {
    code: 2006,
    internalCode: 'SHARE_REQUEST_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '공유 요청을 찾을 수 없습니다.',
  },

  SHARE_INVALID_DATE_RANGE: {
    code: 2007,
    internalCode: 'SHARE_INVALID_DATE_RANGE',
    httpStatus: 400,
    defaultMessage: '시작일은 종료일보다 이전이어야 합니다.',
  },

  SHARE_NOT_APPROVABLE: {
    code: 2008,
    internalCode: 'SHARE_NOT_APPROVABLE',
    httpStatus: 400,
    defaultMessage: '승인할 수 없는 상태입니다.',
  },

  SHARE_NOT_REJECTABLE: {
    code: 2009,
    internalCode: 'SHARE_NOT_REJECTABLE',
    httpStatus: 400,
    defaultMessage: '반려할 수 없는 상태입니다.',
  },

  SHARE_NOT_CANCELLABLE: {
    code: 2010,
    internalCode: 'SHARE_NOT_CANCELLABLE',
    httpStatus: 400,
    defaultMessage: '취소할 수 없는 상태입니다.',
  },

  SHARE_CANCEL_NOT_OWNER: {
    code: 2011,
    internalCode: 'SHARE_CANCEL_NOT_OWNER',
    httpStatus: 403,
    defaultMessage: '본인이 요청한 공유만 취소할 수 있습니다.',
  },

  SHARE_SOME_NOT_FOUND: {
    code: 2012,
    internalCode: 'SHARE_SOME_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '일부 요청을 찾을 수 없습니다.',
  },

  SHARE_BATCH_NOT_APPROVABLE: {
    code: 2013,
    internalCode: 'SHARE_BATCH_NOT_APPROVABLE',
    httpStatus: 400,
    defaultMessage: '승인할 수 없는 상태의 요청이 있습니다.',
  },

  SHARE_BATCH_NOT_REJECTABLE: {
    code: 2014,
    internalCode: 'SHARE_BATCH_NOT_REJECTABLE',
    httpStatus: 400,
    defaultMessage: '반려할 수 없는 상태의 요청이 있습니다.',
  },

  SHARE_BATCH_CONFLICT: {
    code: 2015,
    internalCode: 'SHARE_BATCH_CONFLICT',
    httpStatus: 409,
    defaultMessage: '중복이 발견되었습니다.',
  },

  SHARE_APPROVE_FAILED: {
    code: 2016,
    internalCode: 'SHARE_APPROVE_FAILED',
    httpStatus: 400,
    defaultMessage: '승인 처리에 실패했습니다.',
  },

  SHARE_REJECT_FAILED: {
    code: 2017,
    internalCode: 'SHARE_REJECT_FAILED',
    httpStatus: 400,
    defaultMessage: '반려 처리에 실패했습니다.',
  },

  SHARE_INVALID_APPROVER: {
    code: 2018,
    internalCode: 'SHARE_INVALID_APPROVER',
    httpStatus: 422,
    defaultMessage: '유효하지 않은 승인 대상자입니다. 매니저 이상 역할의 활성 사용자만 지정할 수 있습니다.',
  },

  // ─── External Share/Auth 도메인 (2100~2199) ───

  EXT_AUTH_ACCOUNT_LOCKED: {
    code: 2101,
    internalCode: 'EXT_AUTH_ACCOUNT_LOCKED',
    httpStatus: 403,
    defaultMessage: '계정이 일시적으로 잠겼습니다.',
  },

  EXT_AUTH_INVALID_CREDENTIALS: {
    code: 2102,
    internalCode: 'EXT_AUTH_INVALID_CREDENTIALS',
    httpStatus: 401,
    defaultMessage: '아이디 또는 비밀번호가 올바르지 않습니다.',
  },

  EXT_AUTH_ACCOUNT_DISABLED: {
    code: 2103,
    internalCode: 'EXT_AUTH_ACCOUNT_DISABLED',
    httpStatus: 403,
    defaultMessage: '계정이 비활성화되었습니다.',
  },

  EXT_AUTH_PASSWORD_LOCKED: {
    code: 2104,
    internalCode: 'EXT_AUTH_PASSWORD_LOCKED',
    httpStatus: 403,
    defaultMessage: '비밀번호 입력 오류로 계정이 잠겼습니다.',
  },

  EXT_AUTH_INVALID_REFRESH_TOKEN: {
    code: 2105,
    internalCode: 'EXT_AUTH_INVALID_REFRESH_TOKEN',
    httpStatus: 401,
    defaultMessage: '유효하지 않은 리프레시 토큰입니다.',
  },

  EXT_AUTH_EXPIRED_REFRESH_TOKEN: {
    code: 2106,
    internalCode: 'EXT_AUTH_EXPIRED_REFRESH_TOKEN',
    httpStatus: 401,
    defaultMessage: '만료된 리프레시 토큰입니다.',
  },

  EXT_AUTH_WRONG_PASSWORD: {
    code: 2107,
    internalCode: 'EXT_AUTH_WRONG_PASSWORD',
    httpStatus: 401,
    defaultMessage: '현재 비밀번호가 올바르지 않습니다.',
  },

  EXT_SHARE_NOT_FOUND: {
    code: 2110,
    internalCode: 'EXT_SHARE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '공유를 찾을 수 없습니다.',
  },

  EXT_SHARE_ACCESS_DENIED: {
    code: 2111,
    internalCode: 'EXT_SHARE_ACCESS_DENIED',
    httpStatus: 403,
    defaultMessage: '접근 권한이 없습니다.',
  },

  EXT_SHARE_TOKEN_INVALID: {
    code: 2112,
    internalCode: 'EXT_SHARE_TOKEN_INVALID',
    httpStatus: 401,
    defaultMessage: '콘텐츠 토큰이 유효하지 않거나 만료되었습니다. 상세 조회를 다시 수행하세요.',
  },

  EXT_SHARE_TOKEN_USED: {
    code: 2113,
    internalCode: 'EXT_SHARE_TOKEN_USED',
    httpStatus: 401,
    defaultMessage: '이미 사용된 토큰입니다. 상세 조회를 다시 수행하세요.',
  },

  EXT_SHARE_BLOCKED: {
    code: 2114,
    internalCode: 'EXT_SHARE_BLOCKED',
    httpStatus: 403,
    defaultMessage: '관리자에 의해 차단된 공유입니다.',
  },

  EXT_SHARE_TOKEN_MISMATCH: {
    code: 2115,
    internalCode: 'EXT_SHARE_TOKEN_MISMATCH',
    httpStatus: 401,
    defaultMessage: '토큰과 요청한 공유가 일치하지 않습니다.',
  },

  EXT_SHARE_REVOKED: {
    code: 2116,
    internalCode: 'EXT_SHARE_REVOKED',
    httpStatus: 403,
    defaultMessage: '공유가 취소되었습니다.',
  },

  EXT_SHARE_EXPIRED: {
    code: 2117,
    internalCode: 'EXT_SHARE_EXPIRED',
    httpStatus: 410,
    defaultMessage: '공유 기간이 만료되었습니다.',
  },

  EXT_SHARE_VIEW_LIMIT: {
    code: 2118,
    internalCode: 'EXT_SHARE_VIEW_LIMIT',
    httpStatus: 429,
    defaultMessage: '조회 횟수 제한을 초과했습니다.',
  },

  EXT_SHARE_DOWNLOAD_LIMIT: {
    code: 2119,
    internalCode: 'EXT_SHARE_DOWNLOAD_LIMIT',
    httpStatus: 429,
    defaultMessage: '다운로드 횟수 제한을 초과했습니다.',
  },

  EXT_SHARE_VIEW_DENIED: {
    code: 2120,
    internalCode: 'EXT_SHARE_VIEW_DENIED',
    httpStatus: 403,
    defaultMessage: '조회 권한이 없습니다.',
  },

  EXT_SHARE_DOWNLOAD_DENIED: {
    code: 2121,
    internalCode: 'EXT_SHARE_DOWNLOAD_DENIED',
    httpStatus: 403,
    defaultMessage: '다운로드 권한이 없습니다.',
  },

  EXT_USER_NOT_FOUND: {
    code: 2130,
    internalCode: 'EXT_USER_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '외부 사용자를 찾을 수 없습니다.',
  },

  EXT_USER_DUPLICATE: {
    code: 2131,
    internalCode: 'EXT_USER_DUPLICATE',
    httpStatus: 409,
    defaultMessage: '이미 존재하는 사용자명입니다.',
  },

  EXT_USER_ACCOUNT_DISABLED: {
    code: 2132,
    internalCode: 'EXT_USER_ACCOUNT_DISABLED',
    httpStatus: 403,
    defaultMessage: '계정이 비활성화되었습니다.',
  },

  PUBLIC_SHARE_FILE_NOT_FOUND: {
    code: 2140,
    internalCode: 'PUBLIC_SHARE_FILE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '파일을 찾을 수 없습니다.',
  },

  PUBLIC_SHARE_FILE_NOT_ACTIVE: {
    code: 2141,
    internalCode: 'PUBLIC_SHARE_FILE_NOT_ACTIVE',
    httpStatus: 403,
    defaultMessage: '파일이 활성 상태가 아닙니다.',
  },

  PUBLIC_SHARE_TARGET_NOT_FOUND: {
    code: 2142,
    internalCode: 'PUBLIC_SHARE_TARGET_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '공유 대상 사용자를 찾을 수 없습니다.',
  },

  PUBLIC_SHARE_DUPLICATE: {
    code: 2143,
    internalCode: 'PUBLIC_SHARE_DUPLICATE',
    httpStatus: 409,
    defaultMessage: '이미 해당 사용자에게 파일이 공유되어 있습니다.',
  },

  PUBLIC_SHARE_NOT_FOUND: {
    code: 2144,
    internalCode: 'PUBLIC_SHARE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '공유를 찾을 수 없습니다.',
  },

  PUBLIC_SHARE_NOT_OWNER: {
    code: 2145,
    internalCode: 'PUBLIC_SHARE_NOT_OWNER',
    httpStatus: 403,
    defaultMessage: '공유 소유자만 취소할 수 있습니다.',
  },

  // ─── Auth/Account 도메인 (3000~3999) ───

  AUTH_USER_NOT_FOUND: {
    code: 3001,
    internalCode: 'AUTH_USER_NOT_FOUND',
    httpStatus: 401,
    defaultMessage: '사용자를 찾을 수 없습니다.',
  },

  AUTH_ACCOUNT_DISABLED: {
    code: 3002,
    internalCode: 'AUTH_ACCOUNT_DISABLED',
    httpStatus: 403,
    defaultMessage: '계정이 비활성화되었습니다.',
  },

  AUTH_DEPARTMENT_MISMATCH: {
    code: 3003,
    internalCode: 'AUTH_DEPARTMENT_MISMATCH',
    httpStatus: 403,
    defaultMessage: '부서 이동으로 인해 외부 접근 권한이 없습니다.',
  },

  AUTH_CONFIG_ERROR: {
    code: 3004,
    internalCode: 'AUTH_CONFIG_ERROR',
    httpStatus: 500,
    defaultMessage: '인증 설정 오류가 발생했습니다.',
  },

  AUTH_INVALID_REFRESH_TOKEN: {
    code: 3010,
    internalCode: 'AUTH_INVALID_REFRESH_TOKEN',
    httpStatus: 401,
    defaultMessage: '유효하지 않은 리프레시 토큰입니다.',
  },

  AUTH_REFRESH_TOKEN_EXPIRED: {
    code: 3011,
    internalCode: 'AUTH_REFRESH_TOKEN_EXPIRED',
    httpStatus: 401,
    defaultMessage: '리프레시 토큰이 만료되었습니다. 다시 로그인하세요.',
  },

  AUTH_TOKEN_REUSE_DETECTED: {
    code: 3012,
    internalCode: 'AUTH_TOKEN_REUSE_DETECTED',
    httpStatus: 401,
    defaultMessage: '보안 위협이 감지되었습니다. 다시 로그인하세요.',
  },

  AUTH_TOKEN_REVOKED: {
    code: 3013,
    internalCode: 'AUTH_TOKEN_REVOKED',
    httpStatus: 401,
    defaultMessage: '토큰이 무효화되었습니다.',
  },

  // ─── Folder 도메인 (4000~4999) ───

  FOLDER_NOT_FOUND: {
    code: 4001,
    internalCode: 'FOLDER_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '폴더를 찾을 수 없습니다.',
  },

  FOLDER_PARENT_NOT_FOUND: {
    code: 4002,
    internalCode: 'FOLDER_PARENT_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '상위 폴더를 찾을 수 없습니다.',
  },

  FOLDER_ROOT_NOT_FOUND: {
    code: 4003,
    internalCode: 'FOLDER_ROOT_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '루트 폴더를 찾을 수 없습니다.',
  },

  FOLDER_TARGET_NOT_FOUND: {
    code: 4004,
    internalCode: 'FOLDER_TARGET_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '대상 폴더를 찾을 수 없습니다.',
  },

  FOLDER_NOT_ACTIVE: {
    code: 4005,
    internalCode: 'FOLDER_NOT_ACTIVE',
    httpStatus: 400,
    defaultMessage: '활성 상태의 폴더가 아닙니다.',
  },

  FOLDER_CIRCULAR_MOVE: {
    code: 4006,
    internalCode: 'FOLDER_CIRCULAR_MOVE',
    httpStatus: 409,
    defaultMessage: '자기 자신 또는 하위 폴더로 이동할 수 없습니다.',
  },

  FOLDER_ALREADY_TRASHED: {
    code: 4007,
    internalCode: 'FOLDER_ALREADY_TRASHED',
    httpStatus: 400,
    defaultMessage: '이미 휴지통에 있는 폴더입니다.',
  },

  FOLDER_NOT_EMPTY: {
    code: 4008,
    internalCode: 'FOLDER_NOT_EMPTY',
    httpStatus: 409,
    defaultMessage: '폴더가 비어있지 않아 삭제할 수 없습니다.',
  },

  FOLDER_INVALID_NAME: {
    code: 4009,
    internalCode: 'FOLDER_INVALID_NAME',
    httpStatus: 400,
    defaultMessage: '유효하지 않은 폴더명입니다.',
  },

  FOLDER_SYNCING: {
    code: 4010,
    internalCode: 'FOLDER_SYNCING',
    httpStatus: 409,
    defaultMessage: '폴더가 동기화 중입니다. 잠시 후 다시 시도해주세요.',
  },

  FOLDER_DUPLICATE_EXISTS: {
    code: 4011,
    internalCode: 'FOLDER_DUPLICATE_EXISTS',
    httpStatus: 409,
    defaultMessage: '동일한 이름의 폴더가 이미 존재합니다.',
  },

  SEARCH_HISTORY_NOT_FOUND: {
    code: 4012,
    internalCode: 'SEARCH_HISTORY_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '검색 내역을 찾을 수 없습니다.',
  },

  // ─── Trash 도메인 (5000~5999) ───

  TRASH_ITEM_NOT_FOUND: {
    code: 5001,
    internalCode: 'TRASH_ITEM_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '휴지통 항목을 찾을 수 없습니다.',
  },

  TRASH_FILE_NOT_IN_TRASH: {
    code: 5002,
    internalCode: 'TRASH_FILE_NOT_IN_TRASH',
    httpStatus: 400,
    defaultMessage: '휴지통에 있는 파일만 영구 삭제할 수 있습니다.',
  },

  TRASH_FOLDER_NOT_IN_TRASH: {
    code: 5003,
    internalCode: 'TRASH_FOLDER_NOT_IN_TRASH',
    httpStatus: 400,
    defaultMessage: '휴지통에 있는 폴더만 영구 삭제할 수 있습니다.',
  },

  TRASH_INVALID_ITEM: {
    code: 5004,
    internalCode: 'TRASH_INVALID_ITEM',
    httpStatus: 400,
    defaultMessage: '유효하지 않은 휴지통 항목입니다.',
  },

  // ─── Favorite 도메인 (6000~6999) ───

  FAVORITE_ALREADY_EXISTS: {
    code: 6001,
    internalCode: 'FAVORITE_ALREADY_EXISTS',
    httpStatus: 409,
    defaultMessage: '이미 즐겨찾기에 등록되어 있습니다.',
  },

  FAVORITE_NOT_FOUND: {
    code: 6002,
    internalCode: 'FAVORITE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '즐겨찾기에 등록되어 있지 않습니다.',
  },

  // ─── Role 도메인 (7000~7999) ───

  ROLE_DUPLICATE_NAME: {
    code: 7001,
    internalCode: 'ROLE_DUPLICATE_NAME',
    httpStatus: 409,
    defaultMessage: '이미 존재하는 역할 이름입니다.',
  },

  ROLE_NOT_FOUND: {
    code: 7002,
    internalCode: 'ROLE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '역할을 찾을 수 없습니다.',
  },

  // ─── User 도메인 (8000~8999) ───

  USER_NOT_FOUND: {
    code: 8001,
    internalCode: 'USER_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '사용자를 찾을 수 없습니다.',
  },

  USER_INACTIVE_ROLE_ASSIGN: {
    code: 8002,
    internalCode: 'USER_INACTIVE_ROLE_ASSIGN',
    httpStatus: 400,
    defaultMessage: '비활성 사용자에게 역할을 할당할 수 없습니다.',
  },

  USER_ROLE_NOT_FOUND: {
    code: 8003,
    internalCode: 'USER_ROLE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '역할을 찾을 수 없습니다.',
  },

  // ─── SyncEvent 도메인 (9000~9099) ───

  SYNC_EVENT_NOT_FOUND: {
    code: 9001,
    internalCode: 'SYNC_EVENT_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '동기화 이벤트를 찾을 수 없습니다.',
  },

  SYNC_EVENT_FILE_NOT_FOUND: {
    code: 9002,
    internalCode: 'SYNC_EVENT_FILE_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '파일을 찾을 수 없습니다.',
  },

  // ─── FileActionRequest 도메인 (10000~10099) ───

  FILE_ACTION_REQUEST_NOT_FOUND: {
    code: 10001,
    internalCode: 'FILE_ACTION_REQUEST_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '파일 작업 요청을 찾을 수 없습니다.',
  },

  FILE_ACTION_REQUEST_DUPLICATE: {
    code: 10002,
    internalCode: 'FILE_ACTION_REQUEST_DUPLICATE',
    httpStatus: 409,
    defaultMessage: '해당 파일에 대해 이미 처리 대기 중인 요청이 있습니다.',
  },

  FILE_ACTION_REQUEST_NOT_APPROVABLE: {
    code: 10003,
    internalCode: 'FILE_ACTION_REQUEST_NOT_APPROVABLE',
    httpStatus: 400,
    defaultMessage: '승인할 수 없는 상태의 요청입니다.',
  },

  FILE_ACTION_REQUEST_NOT_REJECTABLE: {
    code: 10004,
    internalCode: 'FILE_ACTION_REQUEST_NOT_REJECTABLE',
    httpStatus: 400,
    defaultMessage: '반려할 수 없는 상태의 요청입니다.',
  },

  FILE_ACTION_REQUEST_NOT_CANCELLABLE: {
    code: 10005,
    internalCode: 'FILE_ACTION_REQUEST_NOT_CANCELLABLE',
    httpStatus: 400,
    defaultMessage: '취소할 수 없는 상태의 요청입니다.',
  },

  FILE_ACTION_REQUEST_NOT_OWNER: {
    code: 10006,
    internalCode: 'FILE_ACTION_REQUEST_NOT_OWNER',
    httpStatus: 403,
    defaultMessage: '본인의 요청만 취소할 수 있습니다.',
  },

  FILE_ACTION_REQUEST_INVALIDATED: {
    code: 10007,
    internalCode: 'FILE_ACTION_REQUEST_INVALIDATED',
    httpStatus: 409,
    defaultMessage: '파일 상태가 변경되어 요청을 실행할 수 없습니다.',
  },

  FILE_ACTION_REQUEST_EXECUTION_FAILED: {
    code: 10008,
    internalCode: 'FILE_ACTION_REQUEST_EXECUTION_FAILED',
    httpStatus: 500,
    defaultMessage: '파일 작업 실행 중 오류가 발생했습니다.',
  },

  FILE_ACTION_REQUEST_INVALID_APPROVER: {
    code: 10009,
    internalCode: 'FILE_ACTION_REQUEST_INVALID_APPROVER',
    httpStatus: 400,
    defaultMessage: '지정된 승인자가 승인 권한을 보유하고 있지 않습니다.',
  },

  FILE_ACTION_REQUEST_SOME_NOT_FOUND: {
    code: 10010,
    internalCode: 'FILE_ACTION_REQUEST_SOME_NOT_FOUND',
    httpStatus: 404,
    defaultMessage: '일부 요청을 찾을 수 없습니다.',
  },

  // ─── System/Other (9900~9999) ───

  NAS_UNAVAILABLE: {
    code: 9900,
    internalCode: 'NAS_UNAVAILABLE',
    httpStatus: 503,
    defaultMessage: 'NAS 스토리지에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
  },

  UNKNOWN_ERROR: {
    code: 9999,
    internalCode: 'UNKNOWN_ERROR',
    httpStatus: 500,
    defaultMessage: '서버 오류가 발생했습니다.',
  },
} satisfies Record<string, ErrorCodeDefinition>;

/**
 * 숫자 코드로 에러 정의 조회
 *
 * @param code - 에러 코드 (숫자)
 * @returns 에러 정의 또는 undefined
 */
export function getErrorDefinition(
  code: number,
): ErrorCodeDefinition | undefined {
  return Object.values(ErrorCodes).find((def) => def.code === code);
}
