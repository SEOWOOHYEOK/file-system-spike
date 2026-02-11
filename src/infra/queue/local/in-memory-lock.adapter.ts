/**
 * 인메모리 락 어댑터
 * IDistributedLockPort의 메모리 기반 구현체
 *
 * 단일 프로세스 환경에서 사용됩니다.
 * 주의: 다중 프로세스/인스턴스 환경에서는 사용하지 마세요.
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  IDistributedLockPort,
  LockResult,
  LockOptions,
} from '../../../domain/queue/ports/distributed-lock.port';

const DEFAULT_TTL = 30000; // 30초
const DEFAULT_WAIT_TIMEOUT = 10000; // 10초
const DEFAULT_RETRY_INTERVAL = 100; // 100ms

interface LockEntry {
  value: string;
  expiresAt: number;
  timeoutId: NodeJS.Timeout;
}

@Injectable()
export class InMemoryLockAdapter implements IDistributedLockPort {
  private readonly logger = new Logger(InMemoryLockAdapter.name);
  private readonly locks: Map<string, LockEntry> = new Map();

  constructor() {
    this.logger.log('InMemoryLockAdapter 초기화됨');
  }

  /**
   * 고유 락 값 생성
   */
  private generateLockValue(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * 만료된 락 정리
   */
  private cleanupExpiredLock(key: string): boolean {
    const entry = this.locks.get(key);
    if (entry && Date.now() >= entry.expiresAt) {
      clearTimeout(entry.timeoutId);
      this.locks.delete(key);
      this.logger.debug(`만료된 락 정리됨: ${key}`);
      return true;
    }
    return false;
  }

  async acquire(key: string, options?: LockOptions): Promise<LockResult> {
    const lockValue = this.generateLockValue();
    const ttl = options?.ttl ?? DEFAULT_TTL;
    const waitTimeout = options?.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;
    const retryInterval = options?.retryInterval ?? DEFAULT_RETRY_INTERVAL;

    const startTime = Date.now();

    while (true) {
      // 만료된 락 정리
      this.cleanupExpiredLock(key);

      // 락 획득 시도
      if (!this.locks.has(key)) {
        const expiresAt = Date.now() + ttl;
        const timeoutId = setTimeout(() => {
          if (this.locks.get(key)?.value === lockValue) {
            this.locks.delete(key);
            this.logger.debug(`락 자동 만료됨: ${key}`);
          }
        }, ttl);

        this.locks.set(key, { value: lockValue, expiresAt, timeoutId });
        this.logger.debug(`락 획득: ${key}`);

        return {
          acquired: true,
          release: async () => {
            const entry = this.locks.get(key);
            if (entry?.value === lockValue) {
              clearTimeout(entry.timeoutId);
              this.locks.delete(key);
              this.logger.debug(`락 해제: ${key}`);
            }
          },
          extend: async (extendTtl?: number) => {
            const entry = this.locks.get(key);
            if (entry?.value !== lockValue) {
              this.logger.warn(`락 연장 실패 (소유자 아님): ${key}`);
              return false;
            }

            // 기존 타임아웃 제거
            clearTimeout(entry.timeoutId);

            // 새 만료 시간과 타임아웃 설정
            const newTtl = extendTtl ?? ttl;
            const newExpiresAt = Date.now() + newTtl;
            const newTimeoutId = setTimeout(() => {
              if (this.locks.get(key)?.value === lockValue) {
                this.locks.delete(key);
                this.logger.debug(`락 자동 만료됨: ${key}`);
              }
            }, newTtl);

            this.locks.set(key, { value: lockValue, expiresAt: newExpiresAt, timeoutId: newTimeoutId });
            this.logger.debug(`락 연장: ${key} (ttl: ${newTtl}ms)`);
            return true;
          },
        };
      }

      // 대기 시간 초과 확인
      if (Date.now() - startTime >= waitTimeout) {
        this.logger.warn(`락 획득 실패 (시간 초과): ${key}`);
        return {
          acquired: false,
          release: async () => { /* no-op */ },
          extend: async () => false,
        };
      }

      // 재시도 대기
      await this.sleep(retryInterval);
    }
  }

  async withLock<T>(key: string, fn: () => Promise<T>, options?: LockOptions): Promise<T> {
    const lock = await this.acquire(key, options);

    if (!lock.acquired) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    // 자동 갱신 설정
    let renewTimer: NodeJS.Timeout | null = null;
    if (options?.autoRenew) {
      const ttl = options?.ttl ?? DEFAULT_TTL;
      const renewInterval = options?.renewIntervalMs ?? Math.floor(ttl * 0.5);
      
      renewTimer = setInterval(async () => {
        const extended = await lock.extend(ttl);
        if (!extended) {
          this.logger.error(`락 자동 갱신 실패: ${key}`);
        }
      }, renewInterval);
      
      this.logger.debug(`락 자동 갱신 활성화: ${key} (주기: ${renewInterval}ms)`);
    }

    try {
      return await fn();
    } finally {
      if (renewTimer) {
        clearInterval(renewTimer);
      }
      await lock.release();
    }
  }

  async isLocked(key: string): Promise<boolean> {
    this.cleanupExpiredLock(key);
    return this.locks.has(key);
  }

  async forceRelease(key: string): Promise<void> {
    const entry = this.locks.get(key);
    if (entry) {
      clearTimeout(entry.timeoutId);
      this.locks.delete(key);
      this.logger.warn(`락 강제 해제: ${key}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
