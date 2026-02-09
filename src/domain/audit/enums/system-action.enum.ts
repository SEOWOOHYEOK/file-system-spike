/**
 * 시스템 대응 조치
 *
 * 시스템이 이벤트에 대해 취한 자동 대응 조치를 분류
 *
 * 설계 원칙:
 * - 사실 기반 중립적 언어 사용 (판단적 용어 지양)
 * - 시스템의 자동화된 반응을 명확히 기록
 */
export enum SystemAction {
  /** 대응 조치 없음 */
  NONE = 'NONE',

  /** 캐시에서 응답 제공 */
  CACHE_SERVED = 'CACHE_SERVED',

  /** 요청 거부 */
  REQUEST_REJECTED = 'REQUEST_REJECTED',

  /** 재시도 예약 */
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',

  /** 성능 저하 모드 전환 */
  DEGRADED_MODE = 'DEGRADED_MODE',

  /** 계정 잠금 */
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',

  /** 알림 트리거 */
  ALERT_TRIGGERED = 'ALERT_TRIGGERED',

  /** 대체 수단 사용 */
  FALLBACK_USED = 'FALLBACK_USED',

  /** 할당량 강제 적용 */
  QUOTA_ENFORCED = 'QUOTA_ENFORCED',

  /** 요청 속도 제한 */
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * 시스템 대응 조치 한국어 설명
 */
export const SystemActionDescription: Record<SystemAction, string> = {
  [SystemAction.NONE]: '대응 조치 없음',
  [SystemAction.CACHE_SERVED]: '캐시에서 응답 제공',
  [SystemAction.REQUEST_REJECTED]: '요청 거부',
  [SystemAction.RETRY_SCHEDULED]: '재시도 예약',
  [SystemAction.DEGRADED_MODE]: '성능 저하 모드 전환',
  [SystemAction.ACCOUNT_LOCKED]: '계정 잠금',
  [SystemAction.ALERT_TRIGGERED]: '알림 트리거',
  [SystemAction.FALLBACK_USED]: '대체 수단 사용',
  [SystemAction.QUOTA_ENFORCED]: '할당량 강제 적용',
  [SystemAction.RATE_LIMITED]: '요청 속도 제한',
};
