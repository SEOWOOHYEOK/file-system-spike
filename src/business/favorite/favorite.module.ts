import { Module } from '@nestjs/common';
import { FavoriteDomainModule } from '../../domain/favorite/favorite.module';
import { FavoriteService } from './favorite.service';

/**
 * 즐겨찾기 비즈니스 모듈
 * 
 * DDD 규칙: Business Module은 Domain Module을 import하고,
 * Repository Module을 직접 import하지 않습니다.
 */
@Module({
  imports: [FavoriteDomainModule],
  providers: [FavoriteService],
  exports: [FavoriteService],
})
export class FavoriteBusinessModule {}
