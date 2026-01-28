import { Injectable } from '@nestjs/common';
import { IContentTokenStore } from '../../domain/external-share/ports/content-token-store.port';

/**
 * 인메모리 토큰 저장소 구현체
 *
 * 개발/테스트용 - 프로덕션에서는 Redis 구현체 사용 권장
 */
@Injectable()
export class InMemoryTokenStore implements IContentTokenStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });

    // 자동 정리 스케줄
    setTimeout(() => {
      this.store.delete(key);
    }, ttlSeconds * 1000);
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // 만료 확인
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
