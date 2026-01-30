import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY } from '../repositories/user.repository.interface';
import type { IUserRepository } from '../repositories/user.repository.interface';
import type { User } from '../entities/user.entity';

@Injectable()
export class UserDomainService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repository: IUserRepository,
  ) {}

  async 저장(user: User): Promise<User> {
    return this.repository.save(user);
  }

  async 조회(id: string): Promise<User | null> {
    return this.repository.findById(id);
  }

  async 전체조회(): Promise<User[]> {
    return this.repository.findAll();
  }

  async 활성전체조회(): Promise<User[]> {
    return this.repository.findAllActive();
  }

  async 아이디목록조회(ids: string[]): Promise<User[]> {
    return this.repository.findByIds(ids);
  }

  async 삭제(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  async 다중저장(users: User[]): Promise<User[]> {
    return this.repository.saveMany(users);
  }
}
