import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { SystemEvent } from '../../../domain/audit/entities/system-event.entity';
import {
  ISystemEventRepository,
} from '../../../domain/audit/repositories/system-event.repository';
import { Severity } from '../../../domain/audit/entities/system-event.entity';
import { SystemEventOrmEntity } from '../entities/system-event.orm-entity';
import { SystemEventMapper } from '../mapper/system-event.mapper';

/**
 * SystemEvent 리포지토리 구현
 */
@Injectable()
export class SystemEventRepository implements ISystemEventRepository {
  constructor(
    @InjectRepository(SystemEventOrmEntity)
    private readonly repository: Repository<SystemEventOrmEntity>,
  ) {}

  async save(event: SystemEvent): Promise<void> {
    const ormEntity = SystemEventMapper.toOrm(event);
    await this.repository.save(ormEntity);
  }

  async saveBatch(events: SystemEvent[]): Promise<void> {
    const ormEntities = events.map((event) => SystemEventMapper.toOrm(event));
    await this.repository.save(ormEntities);
  }

  async findByTimeRange(
    from: Date,
    to: Date,
    limit: number = 1000,
  ): Promise<SystemEvent[]> {
    const orms = await this.repository.find({
      where: {
        occurredAt: Between(from, to),
      },
      order: { occurredAt: 'DESC' },
      take: limit,
    });
    return SystemEventMapper.toDomainList(orms);
  }

  async findByComponent(
    component: string,
    from?: Date,
    to?: Date,
  ): Promise<SystemEvent[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('event')
      .where('event.component = :component', { component });

    if (from) {
      queryBuilder.andWhere('event.occurredAt >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('event.occurredAt <= :to', { to });
    }

    queryBuilder.orderBy('event.occurredAt', 'DESC');

    const orms = await queryBuilder.getMany();
    return SystemEventMapper.toDomainList(orms);
  }

  async findByTraceId(traceId: string): Promise<SystemEvent[]> {
    const orms = await this.repository.find({
      where: { traceId },
      order: { occurredAt: 'ASC' },
    });
    return SystemEventMapper.toDomainList(orms);
  }

  async findByTargetId(
    targetId: string,
    from?: Date,
    to?: Date,
  ): Promise<SystemEvent[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('event')
      .where('event.targetId = :targetId', { targetId });

    if (from) {
      queryBuilder.andWhere('event.occurredAt >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('event.occurredAt <= :to', { to });
    }

    queryBuilder.orderBy('event.occurredAt', 'DESC');

    const orms = await queryBuilder.getMany();
    return SystemEventMapper.toDomainList(orms);
  }

  async findBySeverity(
    severity: Severity,
    from?: Date,
    to?: Date,
  ): Promise<SystemEvent[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('event')
      .where('event.severity = :severity', { severity });

    if (from) {
      queryBuilder.andWhere('event.occurredAt >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('event.occurredAt <= :to', { to });
    }

    queryBuilder.orderBy('event.occurredAt', 'DESC');

    const orms = await queryBuilder.getMany();
    return SystemEventMapper.toDomainList(orms);
  }
}
