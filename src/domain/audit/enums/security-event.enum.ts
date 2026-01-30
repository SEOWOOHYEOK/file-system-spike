/**
 * 보안 이벤트 타입
 *
 * 인증, 토큰, 계정, 접근 관련 보안 이벤트를 분류
 */
export enum SecurityEventType {
  // 인증 관련
  LOGIN_SUCCESS = 'LOGIN_SUCCESS', // 로그인 성공
  LOGIN_FAILURE = 'LOGIN_FAILURE', // 로그인 실패
  LOGOUT = 'LOGOUT', // 로그아웃

  // 토큰 관련
  TOKEN_ISSUED = 'TOKEN_ISSUED', // 토큰 발급
  TOKEN_REFRESHED = 'TOKEN_REFRESHED', // 토큰 갱신
  TOKEN_EXPIRED = 'TOKEN_EXPIRED', // 토큰 만료
  TOKEN_BLACKLISTED = 'TOKEN_BLACKLISTED', // 토큰 무효화

  // 계정 관련
  PASSWORD_CHANGED = 'PASSWORD_CHANGED', // 비밀번호 변경
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED', // 계정 잠금
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED', // 계정 잠금 해제

  // 접근 관련
  PERMISSION_DENIED = 'PERMISSION_DENIED', // 권한 거부
  EXPIRED_LINK_ACCESS = 'EXPIRED_LINK_ACCESS', // 만료 링크 접근
  BLOCKED_SHARE_ACCESS = 'BLOCKED_SHARE_ACCESS', // 차단된 공유 접근
  INVALID_TOKEN = 'INVALID_TOKEN', // 유효하지 않은 토큰

  // 이상 행위
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY', // 의심스러운 활동
  NEW_DEVICE_ACCESS = 'NEW_DEVICE_ACCESS', // 새 디바이스 접근
  UNUSUAL_LOCATION = 'UNUSUAL_LOCATION', // 비정상 위치 접근
}

/**
 * 보안 이벤트 한국어 설명
 */
export const SecurityEventDescription: Record<SecurityEventType, string> = {
  [SecurityEventType.LOGIN_SUCCESS]: '로그인 성공',
  [SecurityEventType.LOGIN_FAILURE]: '로그인 실패',
  [SecurityEventType.LOGOUT]: '로그아웃',
  [SecurityEventType.TOKEN_ISSUED]: '토큰 발급',
  [SecurityEventType.TOKEN_REFRESHED]: '토큰 갱신',
  [SecurityEventType.TOKEN_EXPIRED]: '토큰 만료',
  [SecurityEventType.TOKEN_BLACKLISTED]: '토큰 무효화',
  [SecurityEventType.PASSWORD_CHANGED]: '비밀번호 변경',
  [SecurityEventType.ACCOUNT_LOCKED]: '계정 잠금',
  [SecurityEventType.ACCOUNT_UNLOCKED]: '계정 잠금 해제',
  [SecurityEventType.PERMISSION_DENIED]: '권한 거부',
  [SecurityEventType.EXPIRED_LINK_ACCESS]: '만료된 링크 접근 시도',
  [SecurityEventType.BLOCKED_SHARE_ACCESS]: '차단된 공유 접근 시도',
  [SecurityEventType.INVALID_TOKEN]: '유효하지 않은 토큰',
  [SecurityEventType.SUSPICIOUS_ACTIVITY]: '의심스러운 활동 감지',
  [SecurityEventType.NEW_DEVICE_ACCESS]: '새 디바이스에서 접근',
  [SecurityEventType.UNUSUAL_LOCATION]: '비정상 위치에서 접근',
};

/**
 * 심각도
 */
export enum Severity {
  INFO = 'INFO', // 정보 (관찰)
  WARN = 'WARN', // 경고 (부분 제한)
  HIGH = 'HIGH', // 높음 (즉시 확인 필요)
  CRITICAL = 'CRITICAL', // 심각 (즉시 차단)
}

/**
 * 심각도 한국어 설명
 */
export const SeverityDescription: Record<Severity, string> = {
  [Severity.INFO]: '정보 - 관찰만',
  [Severity.WARN]: '경고 - 부분 제한 필요',
  [Severity.HIGH]: '높음 - 즉시 확인 필요',
  [Severity.CRITICAL]: '심각 - 즉시 차단 필요',
};

/**
 * 보안 이벤트별 기본 심각도 매핑
 */
export const SecurityEventDefaultSeverity: Record<SecurityEventType, Severity> =
  {
    [SecurityEventType.LOGIN_SUCCESS]: Severity.INFO,
    [SecurityEventType.LOGIN_FAILURE]: Severity.WARN,
    [SecurityEventType.LOGOUT]: Severity.INFO,
    [SecurityEventType.TOKEN_ISSUED]: Severity.INFO,
    [SecurityEventType.TOKEN_REFRESHED]: Severity.INFO,
    [SecurityEventType.TOKEN_EXPIRED]: Severity.INFO,
    [SecurityEventType.TOKEN_BLACKLISTED]: Severity.WARN,
    [SecurityEventType.PASSWORD_CHANGED]: Severity.INFO,
    [SecurityEventType.ACCOUNT_LOCKED]: Severity.HIGH,
    [SecurityEventType.ACCOUNT_UNLOCKED]: Severity.INFO,
    [SecurityEventType.PERMISSION_DENIED]: Severity.WARN,
    [SecurityEventType.EXPIRED_LINK_ACCESS]: Severity.WARN,
    [SecurityEventType.BLOCKED_SHARE_ACCESS]: Severity.WARN,
    [SecurityEventType.INVALID_TOKEN]: Severity.WARN,
    [SecurityEventType.SUSPICIOUS_ACTIVITY]: Severity.HIGH,
    [SecurityEventType.NEW_DEVICE_ACCESS]: Severity.WARN,
    [SecurityEventType.UNUSUAL_LOCATION]: Severity.HIGH,
  };
