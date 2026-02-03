import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { SecurityLog } from '../../../domain/audit/entities/security-log.entity';
import {
  ISecurityLogRepository,
  SecurityLogFilterOptions,
} from '../../../domain/audit/repositories/security-log.repository.interface';
import {
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/audit/repositories/audit-log.repository.interface';
import { SecurityEventType } from '../../../domain/audit/enums/security-event.enum';
import { SecurityLogOrmEntity } from '../entities/security-log.orm-entity';
import { SecurityLogMapper } from '../mapper/security-log.mapper';

/**
 * SecurityLog 리포지토리 구현
 */
@Injectable()
export class SecurityLogRepository implements ISecurityLogRepository {
  constructor(
    @InjectRepository(SecurityLogOrmEntity)
    private readonly repository: Repository<SecurityLogOrmEntity>,
  ) {}

  async save(log: SecurityLog): Promise<SecurityLog> {
    const ormEntity = SecurityLogMapper.toOrm(log);
    const saved = await this.repository.save(ormEntity);
    return SecurityLogMapper.toDomain(saved as SecurityLogOrmEntity);
  }

  async saveMany(logs: SecurityLog[]): Promise<void> {
    const ormEntities = logs.map((log) => SecurityLogMapper.toOrm(log));
    await this.repository.save(ormEntities);
  }

  async findById(id: string): Promise<SecurityLog | null> {
    const orm = await this.repository.findOne({ where: { id } });
    return orm ? SecurityLogMapper.toDomain(orm) : null;
  }

  async findByFilter(
    filter: SecurityLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<SecurityLog>> {
    const queryBuilder = this.repository.createQueryBuilder('log');

    if (filter.eventType) {
      queryBuilder.andWhere('log.eventType = :eventType', {
        eventType: filter.eventType,
      });
    }
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      queryBuilder.andWhere('log.eventType IN (:...eventTypes)', {
        eventTypes: filter.eventTypes,
      });
    }
    if (filter.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: filter.userId });
    }
    if (filter.ipAddress) {
      queryBuilder.andWhere('log.ipAddress = :ipAddress', {
        ipAddress: filter.ipAddress,
      });
    }
    if (filter.severity) {
      queryBuilder.andWhere('log.severity = :severity', {
        severity: filter.severity,
      });
    }
    if (filter.severities && filter.severities.length > 0) {
      queryBuilder.andWhere('log.severity IN (:...severities)', {
        severities: filter.severities,
      });
    }
    if (filter.startDate) {
      queryBuilder.andWhere('log.createdAt >= :startDate', {
        startDate: filter.startDate,
      });
    }
    if (filter.endDate) {
      queryBuilder.andWhere('log.createdAt <= :endDate', {
        endDate: filter.endDate,
      });
    }

    queryBuilder
      .orderBy('log.createdAt', 'DESC')
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data: SecurityLogMapper.toDomainList(data),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async findByUserId(
    userId: string,
    limit: number = 100,
  ): Promise<SecurityLog[]> {
    const orms = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return SecurityLogMapper.toDomainList(orms);
  }

  async countLoginFailuresByIp(ipAddress: string, since: Date): Promise<number> {
    return this.repository.count({
      where: {
        ipAddress,
        eventType: SecurityEventType.LOGIN_FAILURE,
        createdAt: MoreThanOrEqual(since),
      },
    });
  }

  async countLoginFailuresByUsername(
    usernameAttempted: string,
    since: Date,
  ): Promise<number> {
    return this.repository.count({
      where: {
        usernameAttempted,
        eventType: SecurityEventType.LOGIN_FAILURE,
        createdAt: MoreThanOrEqual(since),
      },
    });
  }
}
