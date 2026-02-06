import { Module } from '@nestjs/common';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { DomainModule } from '../../domain/domain.module';
import { CacheManagementService } from '../admin/cache-management.service';

// Workers (라우터)
import { NasSyncWorker } from './nas-file-sync.worker';
import { NasFolderSyncWorker } from './nas-folder-sync.worker';
import { CacheEvictionWorker } from './cache-eviction.worker';
import { CacheRestoreWorker } from './cache-restore.worker';

// Shared helpers
import { SyncEventLifecycleHelper } from './shared/sync-event-lifecycle.helper';

// File action handlers
import {
  FileUploadHandler,
  FileRenameHandler,
  FileMoveHandler,
  FileTrashHandler,
  FileRestoreHandler,
  FilePurgeHandler,
} from './handlers';

// Folder action handlers
import {
  FolderMkdirHandler,
  FolderRenameHandler,
  FolderMoveHandler,
  FolderTrashHandler,
  FolderRestoreHandler,
  FolderPurgeHandler,
} from './handlers';

const fileActionHandlers = [
  FileUploadHandler,
  FileRenameHandler,
  FileMoveHandler,
  FileTrashHandler,
  FileRestoreHandler,
  FilePurgeHandler,
];

const folderActionHandlers = [
  FolderMkdirHandler,
  FolderRenameHandler,
  FolderMoveHandler,
  FolderTrashHandler,
  FolderRestoreHandler,
  FolderPurgeHandler,
];

@Module({
  imports: [
    QueueInfraModule,
    StorageInfraModule,
    RepositoryModule,
    DomainModule,
  ],
  providers: [
    // Shared
    SyncEventLifecycleHelper,
    CacheManagementService,
    // Action Handlers
    ...fileActionHandlers,
    ...folderActionHandlers,
    // Workers (라우터)
    NasSyncWorker,
    NasFolderSyncWorker,
    CacheEvictionWorker,
    CacheRestoreWorker,
  ],
  exports: [
    NasSyncWorker,
    NasFolderSyncWorker,
    CacheEvictionWorker,
    CacheRestoreWorker,
    CacheManagementService,
  ],
})
export class WorkerModule {}
