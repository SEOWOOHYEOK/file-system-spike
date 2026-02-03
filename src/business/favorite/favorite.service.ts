import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import {
  FavoriteEntity,
  FavoriteTargetType,
  FavoriteDomainService,
} from '../../domain/favorite';

/**
 * 즐겨찾기 비즈니스 서비스
 * 
 * DDD 규칙: Business Layer는 Repository를 직접 주입받지 않고
 * Domain Service를 통해 도메인 로직을 실행합니다.
 */
@Injectable()
export class FavoriteService {
  constructor(
    private readonly favoriteDomainService: FavoriteDomainService,
  ) {}

  /**
   * 즐겨찾기 등록
   */
  async addFavorite(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<FavoriteEntity> {
    // 이미 등록되어 있는지 확인
    const existing = await this.favoriteDomainService.존재확인(
      userId,
      targetType,
      targetId,
    );

    if (existing) {
      throw new ConflictException('이미 즐겨찾기에 등록되어 있습니다.');
    }

    return this.favoriteDomainService.생성(userId, targetType, targetId);
  }

  /**
   * 즐겨찾기 해제
   */
  async removeFavorite(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void> {
    const existing = await this.favoriteDomainService.존재확인(
      userId,
      targetType,
      targetId,
    );

    if (!existing) {
      throw new NotFoundException('즐겨찾기에 등록되어 있지 않습니다.');
    }

    await this.favoriteDomainService.대상삭제(userId, targetType, targetId);
  }

  /**
   * 즐겨찾기 목록 조회
   */
  async getFavorites(
    userId: string,
    targetType?: FavoriteTargetType,
  ): Promise<FavoriteEntity[]> {
    return this.favoriteDomainService.목록조회(userId, targetType);
  }

  /**
   * 즐겨찾기 여부 확인
   */
  async isFavorite(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<boolean> {
    return this.favoriteDomainService.존재확인(userId, targetType, targetId);
  }
}
