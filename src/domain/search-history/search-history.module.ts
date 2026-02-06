import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { SearchHistoryDomainService } from './service/search-history-domain.service';

/**
 * 검색 내역 도메인 모듈
 * 검색 내역 엔티티, DTO, 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [SearchHistoryDomainService],
  exports: [SearchHistoryDomainService],
})
export class SearchHistoryDomainModule {}
