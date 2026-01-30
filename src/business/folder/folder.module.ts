import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { FolderDomainModule } from '../../domain/folder/folder.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { TrashDomainModule } from '../../domain/trash/trash.module';
import { AuditModule } from '../audit/audit.module';
import { FolderQueryService } from './folder-query.service';
import { FolderCommandService } from './folder-command.service';

/**
 * 폴더 비즈니스 모듈
 * 폴더 조회, 명령 서비스를 제공합니다.
 */
@Module({
  imports: [
    RepositoryModule,
    StorageInfraModule,
    QueueInfraModule,
    FolderDomainModule,
    FileDomainModule,
    TrashDomainModule,
    AuditModule,
  ],
  providers: [FolderQueryService, FolderCommandService],
  exports: [FolderQueryService, FolderCommandService],
})
export class FolderBusinessModule {}
