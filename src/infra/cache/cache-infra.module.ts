import { Module } from '@nestjs/common';
import { CONTENT_TOKEN_STORE } from '../../domain/external-share/ports/content-token-store.port';
import { InMemoryTokenStore } from './in-memory-token-store';

/**
 * 캐시 인프라 모듈
 *
 * 콘텐츠 토큰 저장소 제공
 * TODO: 프로덕션에서는 Redis 구현체로 교체
 */
@Module({
  providers: [
    {
      provide: CONTENT_TOKEN_STORE,
      useClass: InMemoryTokenStore,
    },
  ],
  exports: [CONTENT_TOKEN_STORE],
})
export class CacheInfraModule {}
