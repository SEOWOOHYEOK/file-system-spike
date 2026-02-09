import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { NasHealthHistoryDomainService } from './service/nas-health-history-domain.service';

/**
 * NAS 헬스 체크 이력 도메인 모듈
 * NAS 헬스 체크 이력 엔티티, 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [NasHealthHistoryDomainService],
  exports: [NasHealthHistoryDomainService],
})
export class NasHealthHistoryDomainModule {}
