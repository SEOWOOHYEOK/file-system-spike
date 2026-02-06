/**
 * 워커 전용 루트 모듈
 *
 * API 서버와 분리된 워커 프로세스의 루트 모듈입니다.
 * HTTP 관련 모듈(InterfaceModule, SSOModule 등) 없이
 * 큐 처리 및 스케줄링에 필요한 최소 의존성만 포함합니다.
 *
 * 사용법:
 *   node dist/main-worker
 *   또는
 *   nest start --entryFile main-worker
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import { RepositoryModule } from './infra/database/repository.module';
import { DomainModule } from './domain/domain.module';
import { WorkerModule } from './business/worker/worker.module';
import { WorkerSchedulerModule } from './business/worker/worker-scheduler.module';
import { createWinstonConfig } from './common/logger/winston.config';

@Module({
  imports: [
    // 환경변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Winston 구조화 로깅
    WinstonModule.forRoot(
      createWinstonConfig(process.env.LOG_DIR || 'logs'),
    ),
    // 스케줄링 모듈 (Cron 작업용)
    ScheduleModule.forRoot(),
    // 인프라 레이어
    RepositoryModule,
    // 도메인 레이어
    DomainModule,
    // 워커 모듈 (큐 프로세서 + 핸들러)
    WorkerModule,
    // 워커 스케줄러 (Cron 작업)
    WorkerSchedulerModule,
  ],
})
export class WorkerAppModule {}
