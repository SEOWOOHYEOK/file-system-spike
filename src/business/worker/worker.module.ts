import { Module } from '@nestjs/common';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { NasSyncWorker } from './nas-file-sync.worker';
import { NasFolderSyncWorker } from './nas-folder-sync.worker';
import { CacheEvictionWorker } from './cache-eviction.worker';

@Module({
  imports: [
    QueueInfraModule,
    StorageInfraModule,
    RepositoryModule,
  ],
  providers: [NasSyncWorker, NasFolderSyncWorker, CacheEvictionWorker],
  exports: [NasSyncWorker, NasFolderSyncWorker, CacheEvictionWorker],
})
export class WorkerModule {}
