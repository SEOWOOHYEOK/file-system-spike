import { Module } from '@nestjs/common';
import { FileBusinessModule } from './file/file.module';
import { FolderBusinessModule } from './folder/folder.module';
import { TrashBusinessModule } from './trash/trash.module';
import { WorkerModule } from './worker/worker.module';
import { WorkerSchedulerModule } from './worker/worker-scheduler.module';
import { AdminBusinessModule } from './admin/admin.module';
import { RoleModule } from './role/role.module';
import { UserModule } from './user/user.module';
import { ExternalShareModule } from './external-share/external-share.module';
import { ShareRequestModule } from './share-request/share-request.module';
import { AuditModule } from './audit/audit.module';
import { SyncEventBusinessModule } from './sync-event/sync-event.module';
import { FavoriteBusinessModule } from './favorite/favorite.module';

/**
 * 비즈니스 레이어 통합 모듈
 * 파일, 폴더, 휴지통, Admin, User, Share, ExternalShare, Audit 비즈니스 모듈을 통합합니다.
 *
 * APP_MODE 환경변수:
 * - 'all' (기본): WorkerModule + WorkerSchedulerModule 포함
 * - 'api': WorkerModule, WorkerSchedulerModule 제외 (큐 프로세싱 / Cron 비활성)
 */
const appMode = process.env.APP_MODE || 'all';

/** APP_MODE=api가 아닐 때만 워커/스케줄러 모듈 로드 */
const workerModules = appMode !== 'api'
  ? [WorkerModule, WorkerSchedulerModule]
  : [];

@Module({
  imports: [
    FileBusinessModule,
    FolderBusinessModule,
    TrashBusinessModule,
    ...workerModules,
    AdminBusinessModule,
    RoleModule,
    UserModule,
    ExternalShareModule,
    ShareRequestModule,
    AuditModule,
    SyncEventBusinessModule,
    FavoriteBusinessModule,
  ],
  exports: [
    FileBusinessModule,
    FolderBusinessModule,
    TrashBusinessModule,
    ...workerModules,
    AdminBusinessModule,
    RoleModule,
    UserModule,
    ExternalShareModule,
    ShareRequestModule,
    AuditModule,
    SyncEventBusinessModule,
    FavoriteBusinessModule,
  ],
})
export class BusinessModule {}
