import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  USER_REPOSITORY,
} from '../../domain/user/repositories/user.repository.interface';
import {
  ROLE_REPOSITORY,
} from '../../domain/role/repositories/role.repository.interface';
import { User } from '../../domain/user/entities/user.entity';
import { Role } from '../../domain/role/entities/role.entity';
import type { IUserRepository } from '../../domain/user/repositories/user.repository.interface';
import type { IRoleRepository } from '../../domain/role/repositories/role.repository.interface';

/**
 * User 비즈니스 서비스
 *
 * User CRUD 및 Role 부여/제거 담당
 */
@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepo: IRoleRepository,
  ) {}

  /**
   * 전체 User 목록 조회
   */
  async findAll(): Promise<User[]> {
    return this.userRepo.findAll();
  }

  /**
   * ID로 User 조회
   * @throws NotFoundException User가 존재하지 않는 경우
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * User에게 Role 부여
   * @throws NotFoundException User 또는 Role이 존재하지 않는 경우
   * @throws BadRequestException User가 비활성 상태인 경우
   */
  async assignRole(userId: string, roleId: string): Promise<User> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.isActive) {
      throw new BadRequestException('Cannot assign role to inactive user');
    }

    const role = await this.roleRepo.findById(roleId);
    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    user.assignRole(roleId);
    return this.userRepo.save(user);
  }

  /**
   * User의 Role 제거
   * @throws NotFoundException User가 존재하지 않는 경우
   */
  async removeRole(userId: string): Promise<User> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    user.removeRole();
    return this.userRepo.save(user);
  }

  /**
   * User와 Role 정보 함께 조회
   * @throws NotFoundException User가 존재하지 않는 경우
   */
  async findByIdWithRole(
    userId: string,
  ): Promise<{ user: User; role: Role | null }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    let role: Role | null = null;
    if (user.roleId) {
      role = await this.roleRepo.findById(user.roleId);
    }

    return { user, role };
  }
}
