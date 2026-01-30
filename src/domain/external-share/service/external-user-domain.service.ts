import { Inject, Injectable } from '@nestjs/common';
import { EXTERNAL_USER_REPOSITORY } from '../repositories/external-user.repository.interface';
import type { PaginatedResult, PaginationParams } from '../../../common/types/pagination';
import type { IExternalUserRepository } from '../repositories/external-user.repository.interface';
import type { ExternalUser } from '../entities/external-user.entity';

@Injectable()
export class ExternalUserDomainService {
  constructor(
    @Inject(EXTERNAL_USER_REPOSITORY)
    private readonly repository: IExternalUserRepository,
  ) {}

  async 저장(user: ExternalUser): Promise<ExternalUser> {
    return this.repository.save(user);
  }

  async 조회(id: string): Promise<ExternalUser | null> {
    return this.repository.findById(id);
  }

  async 사용자명조회(username: string): Promise<ExternalUser | null> {
    return this.repository.findByUsername(username);
  }

  async 이메일조회(email: string): Promise<ExternalUser | null> {
    return this.repository.findByEmail(email);
  }

  async 전체조회(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    return this.repository.findAll(pagination);
  }

  async 활성전체조회(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExternalUser>> {
    return this.repository.findAllActive(pagination);
  }

  async 삭제(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}
