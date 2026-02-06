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
import { FileQueryService } from './file-query.service';
import { FileUploadService } from './file-upload.service';
import { FileDownloadService } from './file-download.service';
import { FileManageService } from './file-manage.service';
import { MultipartUploadService } from './multipart-upload.service';
import { UploadQueueService } from './upload-queue.service';
import { SyncProgressService } from './sync-progress.service';

/**
 * 파일 비즈니스 모듈
 * 파일 조회, 업로드, 다운로드, 관리 서비스를 제공합니다.
 *
 * 참고: MultipartOrphanCleanupScheduler는 WorkerSchedulerModule로 이동되었습니다.
 * 프로세스 분리를 위해 스케줄러는 워커 전용 모듈에서 관리합니다.
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
    FileQueryService,
    FileUploadService,
    FileDownloadService,
    FileManageService,
    MultipartUploadService,
    UploadQueueService,
    SyncProgressService,
  ],
  exports: [
    FileQueryService,
    FileUploadService,
    FileDownloadService,
    FileManageService,
    MultipartUploadService,
    UploadQueueService,
    SyncProgressService,
  ],
})
export class FileBusinessModule {}
