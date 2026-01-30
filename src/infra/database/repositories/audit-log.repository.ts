import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AuditLog } from '../../../domain/audit/entities/audit-log.entity';
import {
  IAuditLogRepository,
  AuditLogFilterOptions,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/audit/repositories/audit-log.repository.interface';
import { AuditAction } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { AuditLogOrmEntity } from '../entities/audit-log.orm-entity';
import { AuditLogMapper } from '../mapper/audit-log.mapper';

/**
 * AuditLog 리포지토리 구현
 */
@Injectable()
export class AuditLogRepository implements IAuditLogRepository {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private readonly repository: Repository<AuditLogOrmEntity>,
  ) {}

  async save(log: AuditLog): Promise<AuditLog> {
    const ormEntity = AuditLogMapper.toOrm(log);
    const saved = await this.repository.save(ormEntity);
    return AuditLogMapper.toDomain(saved as AuditLogOrmEntity);
  }

  async saveMany(logs: AuditLog[]): Promise<void> {
    const ormEntities = logs.map((log) => AuditLogMapper.toOrm(log));
    await this.repository.save(ormEntities);
  }

  async findById(id: string): Promise<AuditLog | null> {
    const orm = await this.repository.findOne({ where: { id } });
    return orm ? AuditLogMapper.toDomain(orm) : null;
  }

  async findByFilter(
    filter: AuditLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<AuditLog>> {
    const queryBuilder = this.repository.createQueryBuilder('log');

    // 필터 조건 적용
    if (filter.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: filter.userId });
    }
    if (filter.userType) {
      queryBuilder.andWhere('log.userType = :userType', {
        userType: filter.userType,
      });
    }
    if (filter.action) {
      queryBuilder.andWhere('log.action = :action', { action: filter.action });
    }
    if (filter.actions && filter.actions.length > 0) {
      queryBuilder.andWhere('log.action IN (:...actions)', {
        actions: filter.actions,
      });
    }
    if (filter.targetType) {
      queryBuilder.andWhere('log.targetType = :targetType', {
        targetType: filter.targetType,
      });
    }
    if (filter.targetId) {
      queryBuilder.andWhere('log.targetId = :targetId', {
        targetId: filter.targetId,
      });
    }
    if (filter.result) {
      queryBuilder.andWhere('log.result = :result', { result: filter.result });
    }
    if (filter.ipAddress) {
      queryBuilder.andWhere('log.ipAddress = :ipAddress', {
        ipAddress: filter.ipAddress,
      });
    }
    if (filter.deviceFingerprint) {
      queryBuilder.andWhere('log.deviceFingerprint = :deviceFingerprint', {
        deviceFingerprint: filter.deviceFingerprint,
      });
    }
    if (filter.sessionId) {
      queryBuilder.andWhere('log.sessionId = :sessionId', {
        sessionId: filter.sessionId,
      });
    }
    if (filter.sensitivity) {
      queryBuilder.andWhere('log.sensitivity = :sensitivity', {
        sensitivity: filter.sensitivity,
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

    // 정렬 및 페이지네이션
    queryBuilder
      .orderBy('log.createdAt', 'DESC')
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data: AuditLogMapper.toDomainList(data),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async findByUserId(userId: string, limit: number = 100): Promise<AuditLog[]> {
    const orms = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return AuditLogMapper.toDomainList(orms);
  }

  async findByTarget(
    targetType: TargetType,
    targetId: string,
    limit: number = 100,
  ): Promise<AuditLog[]> {
    const orms = await this.repository.find({
      where: { targetType, targetId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return AuditLogMapper.toDomainList(orms);
  }

  async findBySessionId(sessionId: string): Promise<AuditLog[]> {
    const orms = await this.repository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
    return AuditLogMapper.toDomainList(orms);
  }

  async countByUserAndAction(
    userId: string,
    action: AuditAction,
    since: Date,
  ): Promise<number> {
    return this.repository.count({
      where: {
        userId,
        action,
        createdAt: MoreThanOrEqual(since),
      },
    });
  }

  async countByUserActions(
    userId: string,
    actions: AuditAction[],
    since: Date,
  ): Promise<number> {
    return this.repository.count({
      where: {
        userId,
        action: In(actions),
        createdAt: MoreThanOrEqual(since),
      },
    });
  }
}
