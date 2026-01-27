import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { IUserRepository } from '../../../domain/user/repositories/user.repository.interface';
import { User } from '../../../domain/user/entities/user.entity';
import { UserMapper } from '../mapper/user.mapper';

/**
 * User Repository 구현체
 *
 * TypeORM을 사용한 User 영속성 관리
 */
@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repo: Repository<UserOrmEntity>,
  ) {}

  async save(user: User): Promise<User> {
    const ormEntity = UserMapper.toOrm(user);
    const saved = await this.repo.save(ormEntity);
    return UserMapper.toDomain(saved);
  }

  async findById(id: string): Promise<User | null> {
    const found = await this.repo.findOne({
      where: { id },
    });
    return found ? UserMapper.toDomain(found) : null;
  }

  async findAll(): Promise<User[]> {
    const found = await this.repo.find();
    return found.map(UserMapper.toDomain);
  }

  async findAllActive(): Promise<User[]> {
    const found = await this.repo.find({
      where: { isActive: true },
    });
    return found.map(UserMapper.toDomain);
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return [];
    }
    const found = await this.repo.find({
      where: { id: In(ids) },
    });
    return found.map(UserMapper.toDomain);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async saveMany(users: User[]): Promise<User[]> {
    const ormEntities = users.map(UserMapper.toOrm);
    const saved = await this.repo.save(ormEntities);
    return saved.map(UserMapper.toDomain);
  }
}
