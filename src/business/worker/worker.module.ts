import { Module } from '@nestjs/common';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { NasSyncWorker } from './nas-sync.worker';

@Module({
  imports: [
    QueueInfraModule,
    StorageInfraModule,
    RepositoryModule,
  ],
  providers: [NasSyncWorker],
  exports: [NasSyncWorker],
})
export class WorkerModule {}
