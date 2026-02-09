/**
 * 시스템 이벤트 타입
 *
 * 시스템/인프라에서 발생하는 자동 이벤트를 분류
 *
 * 설계 원칙:
 * - 사실 기반 중립적 언어 사용 (판단적 용어 지양)
 * - 시스템의 상태 변화와 자동 작업을 명확히 기록
 */
export enum SystemEventType {
  /** NAS 상태 변경 */
  NAS_STATUS_CHANGED = 'NAS_STATUS_CHANGED',

  /** NAS 동기화 시작 */
  NAS_SYNC_STARTED = 'NAS_SYNC_STARTED',

  /** NAS 동기화 완료 */
  NAS_SYNC_COMPLETED = 'NAS_SYNC_COMPLETED',

  /** NAS 동기화 지연 */
  NAS_SYNC_DEFERRED = 'NAS_SYNC_DEFERRED',

  /** NAS 동기화 복구 */
  NAS_SYNC_RECOVERED = 'NAS_SYNC_RECOVERED',

  /** NAS 동기화 실패 */
  NAS_SYNC_FAILED = 'NAS_SYNC_FAILED',

  /** NAS 저장 공간 경고 */
  NAS_STORAGE_WARNING = 'NAS_STORAGE_WARNING',

  /** NAS 업로드 거부 */
  NAS_UPLOAD_REJECTED = 'NAS_UPLOAD_REJECTED',

  /** NAS 상태 점검 */
  NAS_HEALTH_CHECK = 'NAS_HEALTH_CHECK',

  /** 스케줄러 실행 */
  SCHEDULER_RUN = 'SCHEDULER_RUN',

  /** 스케줄러 오류 */
  SCHEDULER_ERROR = 'SCHEDULER_ERROR',

  /** 워커 작업 시작 */
  WORKER_TASK_STARTED = 'WORKER_TASK_STARTED',

  /** 워커 작업 완료 */
  WORKER_TASK_COMPLETED = 'WORKER_TASK_COMPLETED',

  /** 워커 작업 실패 */
  WORKER_TASK_FAILED = 'WORKER_TASK_FAILED',
}

/**
 * 시스템 이벤트 타입 한국어 설명
 */
export const SystemEventTypeDescription: Record<SystemEventType, string> = {
  [SystemEventType.NAS_STATUS_CHANGED]: 'NAS 상태 변경',
  [SystemEventType.NAS_SYNC_STARTED]: 'NAS 동기화 시작',
  [SystemEventType.NAS_SYNC_COMPLETED]: 'NAS 동기화 완료',
  [SystemEventType.NAS_SYNC_DEFERRED]: 'NAS 동기화 지연',
  [SystemEventType.NAS_SYNC_RECOVERED]: 'NAS 동기화 복구',
  [SystemEventType.NAS_SYNC_FAILED]: 'NAS 동기화 실패',
  [SystemEventType.NAS_STORAGE_WARNING]: 'NAS 저장 공간 경고',
  [SystemEventType.NAS_UPLOAD_REJECTED]: 'NAS 업로드 거부',
  [SystemEventType.NAS_HEALTH_CHECK]: 'NAS 상태 점검',
  [SystemEventType.SCHEDULER_RUN]: '스케줄러 실행',
  [SystemEventType.SCHEDULER_ERROR]: '스케줄러 오류',
  [SystemEventType.WORKER_TASK_STARTED]: '워커 작업 시작',
  [SystemEventType.WORKER_TASK_COMPLETED]: '워커 작업 완료',
  [SystemEventType.WORKER_TASK_FAILED]: '워커 작업 실패',
};
