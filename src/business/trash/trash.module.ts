import { Module } from '@nestjs/common';
import { QueueInfraModule } from '../../infra/queue/queue-infra.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { FolderDomainModule } from '../../domain/folder/folder.module';
import { TrashDomainModule } from '../../domain/trash/trash.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { TrashService } from './trash.service';

/**
 * 휴지통 비즈니스 모듈
 * 휴지통 관련 비즈니스 서비스를 제공합니다.
 * 
 * DDD 규칙: Business Module은 Domain Module들을 import하고,
 * Repository Module을 직접 import하지 않습니다.
 */
@Module({
  imports: [
    QueueInfraModule,  // JOB_QUEUE_PORT 의존성 제공 (Domain Port)
    FileDomainModule,
    FolderDomainModule,
    TrashDomainModule,
    SyncEventDomainModule,
  ],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashBusinessModule {}
