import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { CacheHealthCheckDomainService } from './services/cache-health-check-domain.service';
import { NasHealthCheckDomainService } from './services/nas-health-check-domain.service';
import { AdminStorageConsistencyDomainService } from './services/admin-storage-consistency-domain.service';
import { AdminSyncEventDomainService } from './services/admin-sync-event-domain.service';

/**
 * Admin 도메인 모듈
 * Admin 관련 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [
    StorageInfraModule,
    ConfigModule,
    forwardRef(() => RepositoryModule),
  ],
  providers: [
    CacheHealthCheckDomainService,
    NasHealthCheckDomainService,
    AdminStorageConsistencyDomainService,
    AdminSyncEventDomainService,
  ],
  exports: [
    CacheHealthCheckDomainService,
    NasHealthCheckDomainService,
    AdminStorageConsistencyDomainService,
    AdminSyncEventDomainService,
  ],
})
export class AdminDomainModule {}
