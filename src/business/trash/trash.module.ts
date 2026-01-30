import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { StorageInfraModule } from '../../infra/storage/storage-infra.module';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { FolderDomainModule } from '../../domain/folder/folder.module';
import { TrashDomainModule } from '../../domain/trash/trash.module';
import { AuditModule } from '../audit/audit.module';
import { TrashService } from './trash.service';

/**
 * 휴지통 비즈니스 모듈
 * 휴지통 관련 비즈니스 서비스를 제공합니다.
 */
@Module({
  imports: [
    RepositoryModule,
    StorageInfraModule,
    QueueInfraModule,  // JOB_QUEUE_PORT 의존성 제공
    FileDomainModule,
    FolderDomainModule,
    TrashDomainModule,
    AuditModule,
  ],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashBusinessModule {}
