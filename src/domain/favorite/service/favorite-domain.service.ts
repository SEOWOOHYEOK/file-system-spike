/**
 * 즐겨찾기 도메인 서비스
 * FavoriteEntity의 행위를 실행하고 영속성을 보장합니다.
 *
 * DDD 관점: 도메인 서비스는 엔티티 행위 호출 후 Repository를 통해 변경사항을 영속화합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  FavoriteEntity,
  FavoriteTargetType,
} from '../entities/favorite.entity';
import {
  FAVORITE_REPOSITORY,
} from '../repositories/favorite.repository.interface';
import type { IFavoriteRepository } from '../repositories/favorite.repository.interface';

@Injectable()
export class FavoriteDomainService {
  constructor(
    @Inject(FAVORITE_REPOSITORY)
    private readonly favoriteRepository: IFavoriteRepository,
  ) {}

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================

  /**
   * 사용자 + 대상으로 즐겨찾기 조회
   */
  async 조회(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<FavoriteEntity | null> {
    return this.favoriteRepository.findByUserAndTarget(userId, targetType, targetId);
  }

  /**
   * 사용자의 즐겨찾기 목록 조회
   */
  async 목록조회(
    userId: string,
    targetType?: FavoriteTargetType,
  ): Promise<FavoriteEntity[]> {
    return this.favoriteRepository.findByUserId(userId, targetType);
  }

  /**
   * 즐겨찾기 존재 여부 확인
   */
  async 존재확인(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<boolean> {
    const existing = await this.favoriteRepository.findByUserAndTarget(
      userId,
      targetType,
      targetId,
    );
    return !!existing;
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * 즐겨찾기 생성
   * 새 즐겨찾기 엔티티를 생성하고 영속화합니다.
   *
   * @param userId - 사용자 ID
   * @param targetType - 대상 타입 (FILE/FOLDER)
   * @param targetId - 대상 ID
   * @returns 생성된 즐겨찾기 엔티티
   */
  async 생성(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<FavoriteEntity> {
    const favorite = FavoriteEntity.create({ userId, targetType, targetId });
    return this.favoriteRepository.save(favorite);
  }

  /**
   * 즐겨찾기 삭제 (ID로 삭제)
   *
   * @param id - 즐겨찾기 ID
   */
  async 삭제(id: string): Promise<void> {
    return this.favoriteRepository.delete(id);
  }

  /**
   * 사용자 + 대상으로 즐겨찾기 삭제
   *
   * @param userId - 사용자 ID
   * @param targetType - 대상 타입
   * @param targetId - 대상 ID
   */
  async 대상삭제(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void> {
    return this.favoriteRepository.deleteByUserAndTarget(userId, targetType, targetId);
  }
}
