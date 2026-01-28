import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RoleOrmEntity } from '../entities/role.orm-entity';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { PermissionOrmEntity } from '../entities/permission.orm-entity';
import { IRoleRepository } from '../../../domain/role/repositories/role.repository.interface';
import { Role } from '../../../domain/role/entities/role.entity';
import { RoleNameEnum } from '../../../domain/role/role-name.enum';
import { RoleMapper } from '../mapper/role.mapper';

@Injectable()
export class RoleRepository implements IRoleRepository {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly repo: Repository<RoleOrmEntity>,
    @InjectRepository(UserOrmEntity)
    private readonly userRepo: Repository<UserOrmEntity>,
    @InjectRepository(PermissionOrmEntity)
    private readonly permissionRepo: Repository<PermissionOrmEntity>,
  ) {}

  async save(role: Role): Promise<Role> {
    const ormEntity = RoleMapper.toOrm(role);

    // ManyToMany 관계를 위해 Permission을 DB에서 직접 로드
    // (TypeORM Entity Manager가 추적하는 인스턴스 필요)
    if (role.permissions && role.permissions.length > 0) {
      const permissionIds = role.permissions.map((p) => p.id);
      ormEntity.permissions = await this.permissionRepo.findBy({
        id: In(permissionIds),
      });
    }

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

  async findByName(name: RoleNameEnum | string): Promise<Role | null> {
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
