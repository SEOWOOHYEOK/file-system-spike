import { Module } from '@nestjs/common';
import { FileDomainModule } from './file/file.module';
import { FolderDomainModule } from './folder/folder.module';
import { TrashDomainModule } from './trash/trash.module';
import { StorageDomainModule } from './storage/storage.module';
import { SyncEventDomainModule } from './sync-event/sync-event.module';
import { AuditDomainModule } from './audit/audit.module';
import { ExternalShareDomainModule } from './external-share/external-share.module';
import { UserDomainModule } from './user/user.module';
import { RoleDomainModule } from './role/role.module';
import { UploadSessionDomainModule } from './upload-session/upload-session.module';

/**
 * 도메인 레이어 통합 모듈
 * 파일, 폴더, 휴지통, Admin 도메인 모듈을 통합합니다.
 */
@Module({
  imports: [
    FileDomainModule,
    FolderDomainModule,
    TrashDomainModule,
    StorageDomainModule,
    SyncEventDomainModule,
    AuditDomainModule,
    ExternalShareDomainModule,
    UserDomainModule,
    RoleDomainModule,
    UploadSessionDomainModule,
  ],
  exports: [
    FileDomainModule,
    FolderDomainModule,
    TrashDomainModule,
    StorageDomainModule,
    SyncEventDomainModule,
    AuditDomainModule,
    ExternalShareDomainModule,
    UserDomainModule,
    RoleDomainModule,
    UploadSessionDomainModule,
  ],
})
export class DomainModule {}
