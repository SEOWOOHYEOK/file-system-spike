import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { FavoriteDomainService } from './service/favorite-domain.service';

/**
 * 즐겨찾기 도메인 모듈
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [FavoriteDomainService],
  exports: [FavoriteDomainService],
})
export class FavoriteDomainModule {}
