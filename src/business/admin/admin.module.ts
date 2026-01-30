import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { AdminService } from './admin.service';
import { CacheHealthCheckService } from '../../infra/storage/cache/cache-health-check.service';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { StorageConsistencyService } from './storage-consistency.service';
import { SyncEventStatsService } from './sync-event-stats.service';
import { FileDomainModule } from '../../domain/file/file.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';

/**
 * Admin 비즈니스 모듈
 * Admin 비즈니스 로직을 제공합니다.
 */
@Module({
  imports: [
    StorageInfraModule,
    ConfigModule,
    FileDomainModule,
    StorageDomainModule,
    SyncEventDomainModule,
  ],
  providers: [
    AdminService,
    CacheHealthCheckService,
    NasHealthCheckService,
    StorageConsistencyService,
    SyncEventStatsService,
  ],
  exports: [AdminService],
})
export class AdminBusinessModule {}
