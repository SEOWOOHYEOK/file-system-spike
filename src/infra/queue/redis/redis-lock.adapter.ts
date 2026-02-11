/**
 * Redis 분산 락 어댑터
 * IDistributedLockPort의 Redis 기반 구현체
 *
 * SET NX EX 명령을 사용하여 분산 환경에서 안전한 락을 제공합니다.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type {
  IDistributedLockPort,
  LockResult,
  LockOptions,
} from '../../../domain/queue/ports/distributed-lock.port';

const DEFAULT_TTL = 30000; // 30초
const DEFAULT_WAIT_TIMEOUT = 10000; // 10초
const DEFAULT_RETRY_INTERVAL = 100; // 100ms

@Injectable()
export class RedisLockAdapter implements IDistributedLockPort, OnModuleDestroy {
  private readonly logger = new Logger(RedisLockAdapter.name);
  private readonly redis: Redis;
  private readonly lockPrefix = 'lock:';

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    });
    this.logger.log('RedisLockAdapter 초기화됨');
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
    this.logger.log('Redis 연결 종료됨');
  }

  /**
   * 락 키 생성
   */
  private getLockKey(key: string): string {
    return `${this.lockPrefix}${key}`;
  }

  /**
   * 고유 락 값 생성 (소유권 확인용)
   */
  private generateLockValue(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async acquire(key: string, options?: LockOptions): Promise<LockResult> {
    const lockKey = this.getLockKey(key);
    const lockValue = this.generateLockValue();
    const ttl = options?.ttl ?? DEFAULT_TTL;
    const waitTimeout = options?.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;
    const retryInterval = options?.retryInterval ?? DEFAULT_RETRY_INTERVAL;

    const startTime = Date.now();

    while (true) {
      // SET NX EX: 키가 없을 때만 설정, TTL 적용
      const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX');

      if (result === 'OK') {
        this.logger.debug(`락 획득: ${key}`);

        return {
          acquired: true,
          release: async () => {
            // 소유권 확인 후 삭제 (Lua 스크립트로 원자적 실행)
            const script = `
              if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
              else
                return 0
              end
            `;
            await this.redis.eval(script, 1, lockKey, lockValue);
            this.logger.debug(`락 해제: ${key}`);
          },
          extend: async (extendTtl?: number) => {
            // 소유권 확인 후 TTL 연장 (Lua 스크립트로 원자적 실행)
            const newTtl = extendTtl ?? ttl;
            const script = `
              if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("pexpire", KEYS[1], ARGV[2])
              else
                return 0
              end
            `;
            const extended = await this.redis.eval(script, 1, lockKey, lockValue, newTtl);
            if (extended === 1) {
              this.logger.debug(`락 연장: ${key} (ttl: ${newTtl}ms)`);
              return true;
            }
            this.logger.warn(`락 연장 실패 (소유자 아님): ${key}`);
            return false;
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
    const lockKey = this.getLockKey(key);
    const result = await this.redis.exists(lockKey);
    return result === 1;
  }

  async forceRelease(key: string): Promise<void> {
    const lockKey = this.getLockKey(key);
    await this.redis.del(lockKey);
    this.logger.warn(`락 강제 해제: ${key}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
