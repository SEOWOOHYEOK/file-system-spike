import { Module } from '@nestjs/common';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { NasSyncWorker } from './nas-file-sync.worker';
import { NasFolderSyncWorker } from './nas-folder-sync.worker';
import { TrashRestoreWorker } from './trash-restore.worker';

@Module({
  imports: [
    QueueInfraModule,
    StorageInfraModule,
    RepositoryModule,
  ],
  providers: [NasSyncWorker, NasFolderSyncWorker, TrashRestoreWorker],
  exports: [NasSyncWorker, NasFolderSyncWorker, TrashRestoreWorker],
})
export class WorkerModule {}
