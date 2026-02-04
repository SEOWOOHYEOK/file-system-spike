import { Module } from '@nestjs/common';
import { FileDomainModule } from '../../domain/file/file.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { SyncEventQueryService } from './sync-event-query.service';
import { SyncEventRecoveryScheduler } from './scheduler/sync-event-recovery.scheduler';

/**
 * 동기화 이벤트 비즈니스 모듈
 * 동기화 이벤트 조회 서비스와 복구 스케줄러를 제공합니다.
 */
@Module({
  imports: [
    FileDomainModule,
    StorageDomainModule,
    SyncEventDomainModule,
    QueueInfraModule,
    RepositoryModule,
  ],
  providers: [SyncEventQueryService, SyncEventRecoveryScheduler],
  exports: [SyncEventQueryService],
})
export class SyncEventBusinessModule {}
