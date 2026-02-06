import { Module } from '@nestjs/common';
import { FileDomainModule } from '../../domain/file/file.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { SyncEventQueryService } from './sync-event-query.service';

/**
 * 동기화 이벤트 비즈니스 모듈
 * 동기화 이벤트 조회 서비스를 제공합니다.
 *
 * 참고: SyncEventRecoveryScheduler는 WorkerSchedulerModule로 이동되었습니다.
 * 프로세스 분리를 위해 스케줄러는 워커 전용 모듈에서 관리합니다.
 */
@Module({
  imports: [
    FileDomainModule,
    StorageDomainModule,
    SyncEventDomainModule,
    QueueInfraModule,
    RepositoryModule,
  ],
  providers: [SyncEventQueryService],
  exports: [SyncEventQueryService],
})
export class SyncEventBusinessModule {}
