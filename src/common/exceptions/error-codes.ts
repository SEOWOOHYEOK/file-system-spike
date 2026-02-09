/**
 * 에러 코드 정의
 *
 * 도메인별로 숫자 코드 범위를 할당합니다:
 * - 1000~1999: File 도메인
 * - 2000~2999: Share/ShareRequest 도메인
 * - 3000~3999: Auth/Account 도메인
 * - 4000~4999: Folder 도메인
 * - 5000~5999: Trash 도메인
 * - 9000~9999: System/Other
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

  // System/Other (9000~9999)
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
