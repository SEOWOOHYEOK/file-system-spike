import { FavoriteEntity, FavoriteTargetType } from '../entities/favorite.entity';

/**
 * 즐겨찾기 리포지토리 인터페이스
 */
export interface IFavoriteRepository {
  /**
   * 저장
   */
  save(favorite: FavoriteEntity): Promise<FavoriteEntity>;

  /**
   * 사용자 + 대상으로 조회
   */
  findByUserAndTarget(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<FavoriteEntity | null>;

  /**
   * 사용자의 즐겨찾기 목록 조회
   */
  findByUserId(
    userId: string,
    targetType?: FavoriteTargetType,
  ): Promise<FavoriteEntity[]>;

  /**
   * 삭제
   */
  delete(id: string): Promise<void>;

  /**
   * 사용자 + 대상으로 삭제
   */
  deleteByUserAndTarget(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void>;
}

/**
 * 리포지토리 토큰 (의존성 주입용)
 */
export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');
