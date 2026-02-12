import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { FolderDomainModule } from '../../domain/folder/folder.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { TrashDomainModule } from '../../domain/trash/trash.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { SearchHistoryDomainModule } from '../../domain/search-history/search-history.module';
import { FileActionRequestDomainModule } from '../../domain/file-action-request/file-action-request.module';
import { AuditModule } from '../audit/audit.module';
import { FolderQueryService } from './folder-query.service';
import { FolderCommandService } from './folder-command.service';
import { SearchService } from './search.service';

/**
 * 폴더 비즈니스 모듈
 * 폴더 조회, 명령 서비스를 제공합니다.
 */
@Module({
  imports: [
    RepositoryModule,
    StorageInfraModule,
    QueueInfraModule,
    // Domain modules
    FolderDomainModule,
    FileDomainModule,
    TrashDomainModule,
    SyncEventDomainModule,
    StorageDomainModule,
    SearchHistoryDomainModule,
    FileActionRequestDomainModule,
    AuditModule,
  ],
  providers: [FolderQueryService, FolderCommandService, SearchService],
  exports: [FolderQueryService, FolderCommandService, SearchService],
})
export class FolderBusinessModule {}
