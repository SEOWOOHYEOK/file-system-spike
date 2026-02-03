import { v4 as uuidv4 } from 'uuid';

/**
 * 즐겨찾기 대상 타입
 */
export enum FavoriteTargetType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

/**
 * 즐겨찾기 도메인 엔티티
 */
export class FavoriteEntity {
  id: string;
  userId: string;
  targetType: FavoriteTargetType;
  targetId: string;
  createdAt: Date;

  constructor(partial: Partial<FavoriteEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 즐겨찾기 생성 팩토리
   */
  static create(params: {
    userId: string;
    targetType: FavoriteTargetType;
    targetId: string;
  }): FavoriteEntity {
    return new FavoriteEntity({
      id: uuidv4(),
      userId: params.userId,
      targetType: params.targetType,
      targetId: params.targetId,
      createdAt: new Date(),
    });
  }
}
