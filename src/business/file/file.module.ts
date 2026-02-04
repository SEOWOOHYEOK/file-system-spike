import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { FolderDomainModule } from '../../domain/folder/folder.module';
import { TrashDomainModule } from '../../domain/trash/trash.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { UploadSessionDomainModule } from '../../domain/upload-session/upload-session.module';
import { AuditModule } from '../audit/audit.module';
import { FileUploadService } from './file-upload.service';
import { FileDownloadService } from './file-download.service';
import { FileManageService } from './file-manage.service';
import { MultipartUploadService } from './multipart-upload.service';
import { MultipartOrphanCleanupScheduler } from './scheduler/multipart-orphan-cleanup.scheduler';

/**
 * 파일 비즈니스 모듈
 * 파일 업로드, 다운로드, 관리 서비스를 제공합니다.
 */
@Module({
  imports: [
    RepositoryModule,
    StorageInfraModule,
    QueueInfraModule,
    FileDomainModule,
    FolderDomainModule,
    TrashDomainModule,
    SyncEventDomainModule,
    StorageDomainModule,
    UploadSessionDomainModule,
    AuditModule,
  ],
  providers: [
    FileUploadService,
    FileDownloadService,
    FileManageService,
    MultipartUploadService,
    MultipartOrphanCleanupScheduler,
  ],
  exports: [
    FileUploadService,
    FileDownloadService,
    FileManageService,
    MultipartUploadService,
    MultipartOrphanCleanupScheduler,
  ],
})
export class FileBusinessModule {}
