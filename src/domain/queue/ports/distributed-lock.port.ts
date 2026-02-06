/**
 * 분산 락 포트
 * 파일별 순차 처리를 보장하기 위한 분산 락 인터페이스
 *
 * 구현체:
 * - RedisLockAdapter: Redis 기반 분산 락 (Bull 환경)
 * - InMemoryLockAdapter: 메모리 기반 락 (LocalFile 환경, 단일 프로세스)
 */

/**
 * 락 획득 결과
 */
export interface LockResult {
  /** 락 획득 성공 여부 */
  acquired: boolean;
  /** 락 해제 함수 (획득 성공 시) */
  release: () => Promise<void>;
  /** 락 TTL 연장 함수 (획득 성공 시) - 작업이 오래 걸릴 때 사용 */
  extend: (ttlMs?: number) => Promise<boolean>;
}

/**
 * 락 옵션
 */
export interface LockOptions {
  /** 락 타임아웃 (ms) - 이 시간이 지나면 자동 해제 */
  ttl?: number;
  /** 락 획득 대기 시간 (ms) - 이 시간 동안 재시도 */
  waitTimeout?: number;
  /** 재시도 간격 (ms) */
  retryInterval?: number;
  /** 자동 갱신 활성화 - 작업 중 자동으로 락 TTL 연장 */
  autoRenew?: boolean;
  /** 자동 갱신 주기 (ms) - 기본값: TTL의 50% */
  renewIntervalMs?: number;
}

/**
 * 분산 락 인터페이스
 */
export interface IDistributedLockPort {
  /**
   * 락 획득 시도
   * @param key - 락 키 (예: "file-sync:{fileId}")
   * @param options - 락 옵션
   * @returns 락 획득 결과
   */
  acquire(key: string, options?: LockOptions): Promise<LockResult>;

  /**
   * 락 획득 후 작업 실행 (편의 메서드)
   * 작업 완료 또는 에러 발생 시 자동으로 락 해제
   * @param key - 락 키
   * @param fn - 실행할 작업
   * @param options - 락 옵션
   * @returns 작업 결과
   */
  withLock<T>(key: string, fn: () => Promise<T>, options?: LockOptions): Promise<T>;

  /**
   * 락 보유 여부 확인
   * @param key - 락 키
   * @returns 락 보유 여부
   */
  isLocked(key: string): Promise<boolean>;

  /**
   * 락 강제 해제 (관리용)
   * @param key - 락 키
   */
  forceRelease(key: string): Promise<void>;
}

/**
 * 분산 락 포트 토큰 (의존성 주입용)
 */
export const DISTRIBUTED_LOCK_PORT = Symbol('DISTRIBUTED_LOCK_PORT');
