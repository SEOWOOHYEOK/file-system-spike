import { Inject, Injectable } from '@nestjs/common';
import { SECURITY_LOG_REPOSITORY } from '../repositories/security-log.repository.interface';
import type {
  ISecurityLogRepository,
  SecurityLogFilterOptions,
} from '../repositories/security-log.repository.interface';
import type {
  PaginatedResult,
  PaginationOptions,
} from '../repositories/audit-log.repository.interface';
import type { SecurityLog } from '../entities/security-log.entity';

@Injectable()
export class SecurityLogDomainService {
  constructor(
    @Inject(SECURITY_LOG_REPOSITORY)
    private readonly repository: ISecurityLogRepository,
  ) {}

  async 저장(log: SecurityLog): Promise<SecurityLog> {
    return this.repository.save(log);
  }

  async 다중저장(logs: SecurityLog[]): Promise<void> {
    return this.repository.saveMany(logs);
  }

  async 조회(id: string): Promise<SecurityLog | null> {
    return this.repository.findById(id);
  }

  async 필터조회(
    filter: SecurityLogFilterOptions,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<SecurityLog>> {
    return this.repository.findByFilter(filter, pagination);
  }

  async 사용자별조회(userId: string, limit?: number): Promise<SecurityLog[]> {
    return this.repository.findByUserId(userId, limit);
  }

  async IP로그인실패카운트(ipAddress: string, since: Date): Promise<number> {
    return this.repository.countLoginFailuresByIp(ipAddress, since);
  }

  async 사용자명로그인실패카운트(
    usernameAttempted: string,
    since: Date,
  ): Promise<number> {
    return this.repository.countLoginFailuresByUsername(usernameAttempted, since);
  }
}
