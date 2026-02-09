import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { NasHealthHistoryOrmEntity } from '../entities/nas-health-history.orm-entity';
import {
  NasHealthHistoryEntity,
  NasHealthStatus,
} from '../../../domain/nas-health-history/entities/nas-health-history.entity';
import type { INasHealthHistoryRepository } from '../../../domain/nas-health-history/repositories/nas-health-history.repository.interface';

@Injectable()
export class NasHealthHistoryRepository implements INasHealthHistoryRepository {
  constructor(
    @InjectRepository(NasHealthHistoryOrmEntity)
    private readonly repository: Repository<NasHealthHistoryOrmEntity>,
  ) {}

  private toDomain(orm: NasHealthHistoryOrmEntity): NasHealthHistoryEntity {
    return new NasHealthHistoryEntity({
      id: orm.id,
      status: orm.status as NasHealthStatus,
      responseTimeMs: orm.responseTimeMs,
      totalBytes: Number(orm.totalBytes),
      usedBytes: Number(orm.usedBytes),
      freeBytes: Number(orm.freeBytes),
      error: orm.error,
      checkedAt: orm.checkedAt,
    });
  }

  private toOrm(domain: NasHealthHistoryEntity): NasHealthHistoryOrmEntity {
    const orm = new NasHealthHistoryOrmEntity();
    orm.id = domain.id;
    orm.status = domain.status;
    orm.responseTimeMs = domain.responseTimeMs;
    orm.totalBytes = domain.totalBytes;
    orm.usedBytes = domain.usedBytes;
    orm.freeBytes = domain.freeBytes;
    orm.error = domain.error;
    orm.checkedAt = domain.checkedAt;
    return orm;
  }

  async save(entity: NasHealthHistoryEntity): Promise<NasHealthHistoryEntity> {
    const orm = this.toOrm(entity);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async findRecentByHours(hours: number): Promise<NasHealthHistoryEntity[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const orms = await this.repository.find({
      where: { checkedAt: MoreThan(since) },
      order: { checkedAt: 'ASC' },
    });
    return orms.map((o) => this.toDomain(o));
  }

  async findLatest(): Promise<NasHealthHistoryEntity | null> {
    const orm = await this.repository.findOne({
      order: { checkedAt: 'DESC' },
      where: {},
    });
    return orm ? this.toDomain(orm) : null;
  }

  async deleteOlderThan(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.repository.delete({
      checkedAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }
}
