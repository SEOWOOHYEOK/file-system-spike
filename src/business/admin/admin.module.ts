import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import {
  Employee,
  EmployeeDepartmentPosition,
  Department,
} from '../../integrations/migration/organization/entities';
import { AdminService } from './admin.service';
import { CacheManagementService } from './cache-management.service';
import { CacheHealthCheckService } from '../../infra/storage/cache/cache-health-check.service';
import { NasHealthCheckService } from '../../infra/storage/nas/nas-health-check.service';
import { StorageConsistencyService } from './storage-consistency.service';
import { SyncEventStatsService } from './sync-event-stats.service';
import { QueueStatusService } from './queue-status.service';
import { ObservabilityService } from './observability.service';
import { FileDomainModule } from '../../domain/file/file.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { SystemConfigDomainModule } from '../../domain/system-config/system-config.module';
import { NasHealthHistoryDomainModule } from '../../domain/nas-health-history/nas-health-history.module';

/**
 * Admin 비즈니스 모듈
 * Admin 비즈니스 로직을 제공합니다.
 *
 * 참고: CacheEvictionWorker 의존성을 CacheManagementService로 교체하여
 * API 프로세스에서 WorkerModule 없이도 캐시 관리 기능을 사용할 수 있습니다.
 */
@Module({
  imports: [
    StorageInfraModule,
    QueueInfraModule,
    RepositoryModule,
    TypeOrmModule.forFeature([Employee, EmployeeDepartmentPosition, Department]),
    ConfigModule,
    FileDomainModule,
    StorageDomainModule,
    SyncEventDomainModule,
    SystemConfigDomainModule,
    NasHealthHistoryDomainModule,
  ],
  providers: [
    AdminService,
    CacheManagementService,
    CacheHealthCheckService,
    NasHealthCheckService,
    StorageConsistencyService,
    SyncEventStatsService,
    QueueStatusService,
    ObservabilityService,
  ],
  exports: [AdminService, QueueStatusService, SyncEventStatsService, ObservabilityService],
})
export class AdminBusinessModule {}
