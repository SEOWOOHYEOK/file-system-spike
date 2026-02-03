import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FavoriteOrmEntity } from '../entities/favorite.orm-entity';
import {
  FavoriteEntity,
  FavoriteTargetType,
} from '../../../domain/favorite/entities/favorite.entity';
import type { IFavoriteRepository } from '../../../domain/favorite/repositories/favorite.repository.interface';

@Injectable()
export class FavoriteRepository implements IFavoriteRepository {
  constructor(
    @InjectRepository(FavoriteOrmEntity)
    private readonly repository: Repository<FavoriteOrmEntity>,
  ) {}

  private toDomain(orm: FavoriteOrmEntity): FavoriteEntity {
    return new FavoriteEntity({
      id: orm.id,
      userId: orm.userId,
      targetType: orm.targetType as FavoriteTargetType,
      targetId: orm.targetId,
      createdAt: orm.createdAt,
    });
  }

  private toOrm(domain: FavoriteEntity): FavoriteOrmEntity {
    const orm = new FavoriteOrmEntity();
    orm.id = domain.id;
    orm.userId = domain.userId;
    orm.targetType = domain.targetType;
    orm.targetId = domain.targetId;
    orm.createdAt = domain.createdAt;
    return orm;
  }

  async save(favorite: FavoriteEntity): Promise<FavoriteEntity> {
    const orm = this.toOrm(favorite);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async findByUserAndTarget(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<FavoriteEntity | null> {
    const orm = await this.repository.findOne({
      where: { userId, targetType, targetId },
    });
    return orm ? this.toDomain(orm) : null;
  }

  async findByUserId(
    userId: string,
    targetType?: FavoriteTargetType,
  ): Promise<FavoriteEntity[]> {
    const where: Record<string, unknown> = { userId };
    if (targetType) {
      where.targetType = targetType;
    }

    const orms = await this.repository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return orms.map((orm) => this.toDomain(orm));
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async deleteByUserAndTarget(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void> {
    await this.repository.delete({ userId, targetType, targetId });
  }
}
