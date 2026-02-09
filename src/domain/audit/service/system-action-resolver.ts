import { Logger } from '@nestjs/common';
import { SystemAction } from '../enums/system-action.enum';

const logger = new Logger('SystemActionResolver');

/**
 * 에러 코드에서 SystemAction을 자동 추론하는 매핑 테이블.
 * 새 에러 코드 추가 시 여기에 매핑을 추가하면 인터셉터가 자동으로 적용.
 */
const ERROR_TO_SYSTEM_ACTION: Record<string, SystemAction> = {
  'NAS_UNAVAILABLE':      SystemAction.REQUEST_REJECTED,
  'NAS_STORAGE_FULL':     SystemAction.REQUEST_REJECTED,
  'RATE_LIMIT_EXCEEDED':  SystemAction.RATE_LIMITED,
  'ACCOUNT_LOCKED':       SystemAction.ACCOUNT_LOCKED,
  'QUOTA_EXCEEDED':       SystemAction.QUOTA_ENFORCED,
  'NAS_UNHEALTHY':        SystemAction.DEGRADED_MODE,
  'CACHE_HIT':            SystemAction.CACHE_SERVED,
  'PERMISSION_DENIED':    SystemAction.REQUEST_REJECTED,
  'EXPIRED_LINK':         SystemAction.REQUEST_REJECTED,
  'BLOCKED_SHARE':        SystemAction.REQUEST_REJECTED,
};

/**
 * 에러 코드에서 SystemAction을 자동 추론.
 * 매핑이 없으면 NONE을 반환하고 경고 로그를 출력.
 *
 * @param errorCode 구조화된 에러 코드 (optional)
 * @returns 추론된 SystemAction
 */
export function resolveSystemAction(errorCode?: string): SystemAction {
  if (!errorCode) {
    return SystemAction.NONE;
  }

  const action = ERROR_TO_SYSTEM_ACTION[errorCode];

  if (!action) {
    logger.warn(
      `[ObservabilityGap] 에러 코드 '${errorCode}'에 대한 SystemAction 매핑이 없습니다. ` +
      `system-action-resolver.ts에 추가해주세요.`
    );
    return SystemAction.NONE;
  }

  return action;
}

/**
 * 에러 코드에 매핑이 등록되어 있는지 확인.
 * 테스트에서 사용.
 */
export function hasSystemActionMapping(errorCode: string): boolean {
  return errorCode in ERROR_TO_SYSTEM_ACTION;
}

/**
 * 등록된 모든 에러 코드-SystemAction 매핑을 반환.
 * 디버깅/문서화에 사용.
 */
export function getAllSystemActionMappings(): Record<string, SystemAction> {
  return { ...ERROR_TO_SYSTEM_ACTION };
}
