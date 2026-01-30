import { Module } from '@nestjs/common';
import { FileDomainModule } from '../../domain/file/file.module';
import { StorageDomainModule } from '../../domain/storage/storage.module';
import { SyncEventDomainModule } from '../../domain/sync-event/sync-event.module';
import { SyncEventQueryService } from './sync-event-query.service';

/**
 * 동기화 이벤트 비즈니스 모듈
 * 동기화 이벤트 조회 서비스를 제공합니다.
 */
@Module({
  imports: [FileDomainModule, StorageDomainModule, SyncEventDomainModule],
  providers: [SyncEventQueryService],
  exports: [SyncEventQueryService],
})
export class SyncEventBusinessModule {}
