/**
 * 큐 인프라 모듈
 * 환경 설정에 따라 적절한 큐 어댑터를 주입합니다.
 *
 * 환경변수:
 * - QUEUE_TYPE: 'redis' | 'local' (기본값: 'local')
 *
 * Redis 설정 (QUEUE_TYPE=redis):
 * - REDIS_HOST: Redis 호스트 (기본값: 'localhost')
 * - REDIS_PORT: Redis 포트 (기본값: 6379)
 * - REDIS_PASSWORD: Redis 비밀번호 (선택)
 *
 * Local 설정 (QUEUE_TYPE=local):
 * - QUEUE_LOCAL_PATH: 큐 파일 저장 경로 (기본값: '/data/queue')
 * - QUEUE_POLLING_INTERVAL: 폴링 간격 ms (기본값: 3000)
 */

import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JOB_QUEUE_PORT } from './job-queue.port';
import { DISTRIBUTED_LOCK_PORT } from './distributed-lock.port';
import { PROGRESS_STORAGE_PORT } from './progress-storage.port';
import { BullQueueAdapter } from './redis/bull-queue.adapter';
import { RedisLockAdapter } from './redis/redis-lock.adapter';
import { RedisProgressAdapter } from './redis/redis-progress.adapter';
import { LocalFileQueueAdapter } from './local/local-file-queue.adapter';
import { InMemoryLockAdapter } from './local/in-memory-lock.adapter';
import { FileProgressAdapter } from './local/file-progress.adapter';

/**
 * 큐 타입
 */
export type QueueType = 'redis' | 'local';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: JOB_QUEUE_PORT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('QueueInfraModule');
        const queueType = configService.get<QueueType>('QUEUE_TYPE', 'local');

        logger.log(`Initializing queue adapter: ${queueType}`);

        switch (queueType) {
          case 'redis':
            return new BullQueueAdapter(configService);
          case 'local':
          default:
            return new LocalFileQueueAdapter(configService);
        }
      },
      inject: [ConfigService],
    },
    {
      provide: DISTRIBUTED_LOCK_PORT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('QueueInfraModule');
        const queueType = configService.get<QueueType>('QUEUE_TYPE', 'local');

        logger.log(`Initializing lock adapter: ${queueType}`);

        switch (queueType) {
          case 'redis':
            return new RedisLockAdapter(configService);
          case 'local':
          default:
            return new InMemoryLockAdapter();
        }
      },
      inject: [ConfigService],
    },
    {
      provide: PROGRESS_STORAGE_PORT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('QueueInfraModule');
        const queueType = configService.get<QueueType>('QUEUE_TYPE', 'local');

        logger.log(`Initializing progress adapter: ${queueType}`);

        switch (queueType) {
          case 'redis':
            return new RedisProgressAdapter(configService);
          case 'local':
          default:
            return new FileProgressAdapter(configService);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [JOB_QUEUE_PORT, DISTRIBUTED_LOCK_PORT, PROGRESS_STORAGE_PORT],
})
export class QueueInfraModule {}
