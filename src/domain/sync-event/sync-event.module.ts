import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { SyncEventDomainService } from './service/sync-event-domain.service';

/**
 * 동기화 이벤트 도메인 모듈
 * 동기화 이벤트 엔티티 및 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [SyncEventDomainService],
  exports: [SyncEventDomainService],
})
export class SyncEventDomainModule {}
