// Entities
export { SearchHistoryEntity, SearchHistoryType } from './entities/search-history.entity';

// DTOs
export { SearchHistoryQuery, SearchHistoryResponse } from './dto/search-history.dto';
export type { SearchHistoryItem } from './dto/search-history.dto';

// Repository Interface
export { SEARCH_HISTORY_REPOSITORY } from './repositories/search-history.repository.interface';
export type { ISearchHistoryRepository } from './repositories/search-history.repository.interface';

// Domain Service
export { SearchHistoryDomainService } from './service/search-history-domain.service';

// Module
export { SearchHistoryDomainModule } from './search-history.module';
