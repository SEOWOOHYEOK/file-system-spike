/**
 * 워커 프로세스 엔트리포인트
 *
 * API 서버와 분리된 별도 프로세스로 실행되며,
 * HTTP 서버 없이 큐 작업 처리 및 Cron 스케줄링만 수행합니다.
 *
 * 실행 방법:
 *   개발: npm run start:worker:dev
 *   프로덕션: node dist/main-worker
 *
 * 전제조건:
 *   - QUEUE_TYPE=redis (프로세스 분리 시 Redis 기반 큐 필수)
 *   - Redis, Database 연결 가능한 환경
 */

/**
 * Node.js libuv 스레드 풀 크기 설정 (기본값 4 → 16)
 * 병렬 파일 I/O 성능 향상을 위해 스레드 풀 확장
 * 주의: 반드시 다른 import 전에 설정해야 함
 */
process.env.UV_THREADPOOL_SIZE = '16';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { WorkerAppModule } from './worker-app.module';

async function bootstrap() {
  const logger = new Logger('WorkerMain');

  // ===== QUEUE_TYPE 검증 =====
  const queueType = process.env.QUEUE_TYPE || 'local';
  if (queueType === 'local') {
    logger.warn(
      '⚠️  QUEUE_TYPE=local 상태에서 워커 프로세스를 분리 실행하고 있습니다. ' +
      'LocalFileQueue의 InMemoryLockAdapter는 프로세스 간 공유가 불가능합니다. ' +
      '프로세스 분리 시 QUEUE_TYPE=redis 사용을 강력히 권장합니다.',
    );
  }

  // ===== 워커 애플리케이션 부트스트랩 =====
  // createApplicationContext: HTTP 서버 없이 NestJS DI 컨테이너만 초기화
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    bufferLogs: true,
  });

  // Winston 로거를 NestJS 기본 로거로 교체
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Graceful Shutdown 지원
  // SIGTERM/SIGINT 수신 시 진행 중인 작업 완료 후 종료
  app.enableShutdownHooks();

  logger.log('🔧 Worker process started successfully');
  logger.log(`📋 Queue type: ${queueType}`);
  logger.log('📌 Listening for queue jobs and running scheduled tasks...');

  // 프로세스는 큐 리스닝 + Cron 스케줄링으로 유지됨
  // (Bull processJobs() 또는 LocalFileQueue polling이 이벤트 루프를 유지)
}

bootstrap().catch((error) => {
  const logger = new Logger('WorkerMain');
  logger.error('Failed to start worker process', error);
  process.exit(1);
});
