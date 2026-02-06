/**
 * 워커 스케줄러 모듈
 *
 * 워커 프로세스에서 실행되는 Cron 스케줄러를 통합합니다.
 * 기존 비즈니스 모듈에 분산되어 있던 스케줄러를 워커 전용으로 모아
 * API 프로세스에서 불필요한 Cron 실행을 원천 차단합니다.
 *
 * 포함 스케줄러:
 * - SyncEventRecoveryScheduler: PENDING 상태 SyncEvent 복구 (5분 주기)
 * - MultipartOrphanCleanupScheduler: 만료/취소된 업로드 세션 정리 (30분 주기)
 * - CacheEvictionWorker @Cron: CacheEvictionWorker 자체에 포함 (WorkerModule에서 제공)
 */
import { Module } from '@nestjs/common';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { UploadSessionDomainModule } from '../../domain/upload-session/upload-session.module';
import { FileBusinessModule } from '../file/file.module';

import { SyncEventRecoveryScheduler } from '../sync-event/scheduler/sync-event-recovery.scheduler';
import { MultipartOrphanCleanupScheduler } from '../file/scheduler/multipart-orphan-cleanup.scheduler';

@Module({
  imports: [
    // SyncEventRecoveryScheduler 의존성
    SyncEventDomainModule,
    QueueInfraModule,
    RepositoryModule,

    // MultipartOrphanCleanupScheduler 의존성
    StorageInfraModule,
    UploadSessionDomainModule,
    FileBusinessModule, // UploadQueueService 제공
  ],
  providers: [
    SyncEventRecoveryScheduler,
    MultipartOrphanCleanupScheduler,
  ],
})
export class WorkerSchedulerModule {}
