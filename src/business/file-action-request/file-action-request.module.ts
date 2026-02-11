import { Module } from '@nestjs/common';
import { FileActionRequestDomainModule } from '../../domain/file-action-request/file-action-request.module';
import { FileActionRequestInfraModule } from '../../infra/database/file-action-request-infra.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { FolderDomainModule } from '../../domain/folder/folder.module';
import { FileBusinessModule } from '../file/file.module';
import { UserModule } from '../user/user.module';
import { FILE_ACTION_REQUEST_NOTIFICATION_PORT } from '../../domain/file-action-request/ports/notification.port';
import { NoopNotificationAdapter } from '../../infra/notification/noop-notification.adapter';
import { FileActionRequestCommandService } from './file-action-request-command.service';
import { FileActionRequestQueryService } from './file-action-request-query.service';
import { FileActionRequestValidationService } from './file-action-request-validation.service';

@Module({
  imports: [
    FileActionRequestDomainModule,
    FileActionRequestInfraModule,
    FileDomainModule,
    FolderDomainModule,
    FileBusinessModule,
    UserModule,
  ],
  providers: [
    FileActionRequestCommandService,
    FileActionRequestQueryService,
    FileActionRequestValidationService,
    {
      provide: FILE_ACTION_REQUEST_NOTIFICATION_PORT,
      useClass: NoopNotificationAdapter,
    },
  ],
  exports: [
    FileActionRequestCommandService,
    FileActionRequestQueryService,
  ],
})
export class FileActionRequestModule {}
