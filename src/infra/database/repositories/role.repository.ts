import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleOrmEntity } from '../entities/role.orm-entity';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { IRoleRepository } from '../../../domain/role/repositories/role.repository.interface';
import { Role } from '../../../domain/role/entities/role.entity';
import { RoleMapper } from '../mapper/role.mapper';

@Injectable()
export class RoleRepository implements IRoleRepository {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly repo: Repository<RoleOrmEntity>,
    @InjectRepository(UserOrmEntity)
    private readonly userRepo: Repository<UserOrmEntity>,
  ) {}

  async save(role: Role): Promise<Role> {
    const ormEntity = RoleMapper.toOrm(role);
    const saved = await this.repo.save(ormEntity);
    return RoleMapper.toDomain(saved);
  }

  async findById(id: string): Promise<Role | null> {
    const found = await this.repo.findOne({ 
      where: { id },
      relations: ['permissions']
    });
    return found ? RoleMapper.toDomain(found) : null;
  }

  async findByName(name: string): Promise<Role | null> {
    const found = await this.repo.findOne({ 
      where: { name },
      relations: ['permissions']
    });
    return found ? RoleMapper.toDomain(found) : null;
  }

  async findAll(): Promise<Role[]> {
    const found = await this.repo.find({
      relations: ['permissions']
    });
    return found.map(RoleMapper.toDomain);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  /**
   * User의 Role 조회
   *
   * User 테이블 기반으로 Role 조회 (User.roleId 사용)
   * User는 1개의 Role만 가지므로 배열에 1개 또는 0개의 Role 반환
   */
  async findByUserId(userId: string): Promise<Role[]> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user || !user.roleId) {
      return [];
    }

    const role = await this.repo.findOne({
      where: { id: user.roleId },
      relations: ['permissions'],
    });

    return role ? [RoleMapper.toDomain(role)] : [];
  }
}
