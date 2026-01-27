import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { AdminService } from './admin.service';
import { CacheHealthCheckService } from '../../infra/storage/cache/cache-health-check.service';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { StorageConsistencyService } from './storage-consistency.service';
import { SyncEventStatsService } from './sync-event-stats.service';

/**
 * Admin 비즈니스 모듈
 * Admin 비즈니스 로직을 제공합니다.
 */
@Module({
  imports: [
    StorageInfraModule,
    ConfigModule,
    forwardRef(() => RepositoryModule),
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
