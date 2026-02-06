/**
 * Redis 진행률 어댑터
 * IProgressStoragePort의 Redis 기반 구현체
 *
 * Redis SETEX 명령을 사용하여 TTL 기반 자동 만료를 지원합니다.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { IProgressStoragePort, SyncProgress } from '../../../domain/queue/ports/progress-storage.port';

const DEFAULT_TTL = 3600; // 1시간 (초)

@Injectable()
export class RedisProgressAdapter implements IProgressStoragePort, OnModuleDestroy {
  private readonly logger = new Logger(RedisProgressAdapter.name);
  private readonly redis: Redis;
  private readonly keyPrefix = 'sync-progress:';
  private readonly ttl: number;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    });
    this.ttl = this.configService.get<number>('PROGRESS_TTL', DEFAULT_TTL);
    this.logger.log(`RedisProgressAdapter initialized (TTL: ${this.ttl}s)`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }

  /**
   * Redis 키 생성
   */
  private getKey(syncEventId: string): string {
    return `${this.keyPrefix}${syncEventId}`;
  }

  async set(syncEventId: string, progress: SyncProgress): Promise<void> {
    const key = this.getKey(syncEventId);
    await this.redis.setex(key, this.ttl, JSON.stringify(progress));
    this.logger.debug(`Progress set: ${syncEventId} (${progress.progress.percent}%)`);
  }

  async get(syncEventId: string): Promise<SyncProgress | null> {
    const key = this.getKey(syncEventId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async delete(syncEventId: string): Promise<void> {
    const key = this.getKey(syncEventId);
    await this.redis.del(key);
    this.logger.debug(`Progress deleted: ${syncEventId}`);
  }

  async update(syncEventId: string, partial: Partial<SyncProgress>): Promise<void> {
    const existing = await this.get(syncEventId);
    if (!existing) {
      this.logger.warn(`Progress not found for update: ${syncEventId}`);
      return;
    }

    const updated: SyncProgress = {
      ...existing,
      ...partial,
      progress: {
        ...existing.progress,
        ...(partial.progress || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    await this.set(syncEventId, updated);
  }
}
