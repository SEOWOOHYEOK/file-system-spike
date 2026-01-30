import { Module } from '@nestjs/common';
import { FileBusinessModule } from './file/file.module';
import { FolderBusinessModule } from './folder/folder.module';
import { TrashBusinessModule } from './trash/trash.module';
import { WorkerModule } from './worker/worker.module';
import { AdminBusinessModule } from './admin/admin.module';
import { RoleModule } from './role/role.module';
import { UserModule } from './user/user.module';
import { ExternalShareModule } from './external-share/external-share.module';
import { AuditModule } from './audit/audit.module';

/**
 * 비즈니스 레이어 통합 모듈
 * 파일, 폴더, 휴지통, Admin, User, Share, ExternalShare, Audit 비즈니스 모듈을 통합합니다.
 */
@Module({
  imports: [
    FileBusinessModule,
    FolderBusinessModule,
    TrashBusinessModule,
    WorkerModule,
    AdminBusinessModule,
    RoleModule,
    UserModule,
    ExternalShareModule,
    AuditModule,
  ],
  exports: [
    FileBusinessModule,
    FolderBusinessModule,
    TrashBusinessModule,
    WorkerModule,
    AdminBusinessModule,
    RoleModule,
    UserModule,
    ExternalShareModule,
    AuditModule,
  ],
})
export class BusinessModule { }
