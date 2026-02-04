import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { AdminService } from './admin.service';
import { CacheHealthCheckService } from '../../infra/storage/cache/cache-health-check.service';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { StorageConsistencyService } from './storage-consistency.service';
import { SyncEventStatsService } from './sync-event-stats.service';
import { QueueStatusService } from './queue-status.service';
import { FileDomainModule } from '../../domain/file/file.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { WorkerModule } from '../worker/worker.module';

/**
 * Admin 비즈니스 모듈
 * Admin 비즈니스 로직을 제공합니다.
 */
@Module({
  imports: [
    StorageInfraModule,
    QueueInfraModule,
    ConfigModule,
    FileDomainModule,
    StorageDomainModule,
    SyncEventDomainModule,
    WorkerModule,
  ],
  providers: [
    AdminService,
    CacheHealthCheckService,
    NasHealthCheckService,
    StorageConsistencyService,
    SyncEventStatsService,
    QueueStatusService,
  ],
  exports: [AdminService, QueueStatusService, SyncEventStatsService],
})
export class AdminBusinessModule {}
