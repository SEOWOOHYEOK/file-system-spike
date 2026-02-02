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
    this.logger.log('InMemoryLockAdapter initialized');
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
      this.logger.debug(`Expired lock cleaned up: ${key}`);
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
            this.logger.debug(`Lock auto-expired: ${key}`);
          }
        }, ttl);

        this.locks.set(key, { value: lockValue, expiresAt, timeoutId });
        this.logger.debug(`Lock acquired: ${key}`);

        return {
          acquired: true,
          release: async () => {
            const entry = this.locks.get(key);
            if (entry?.value === lockValue) {
              clearTimeout(entry.timeoutId);
              this.locks.delete(key);
              this.logger.debug(`Lock released: ${key}`);
            }
          },
        };
      }

      // 대기 시간 초과 확인
      if (Date.now() - startTime >= waitTimeout) {
        this.logger.warn(`Failed to acquire lock (timeout): ${key}`);
        return {
          acquired: false,
          release: async () => { /* no-op */ },
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

    try {
      return await fn();
    } finally {
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
      this.logger.warn(`Lock force released: ${key}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
