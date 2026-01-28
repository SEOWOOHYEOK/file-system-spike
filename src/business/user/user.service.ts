import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  USER_REPOSITORY,
} from '../../domain/user/repositories/user.repository.interface';
import {
  ROLE_REPOSITORY,
} from '../../domain/role/repositories/role.repository.interface';
import { User } from '../../domain/user/entities/user.entity';
import { Role } from '../../domain/role/entities/role.entity';
import { RoleNameEnum } from '../../domain/role/role-name.enum';
import type { IUserRepository } from '../../domain/user/repositories/user.repository.interface';
import type { IRoleRepository } from '../../domain/role/repositories/role.repository.interface';

/**
 * User 비즈니스 서비스
 *
 * User CRUD 및 Role 부여/제거 담당
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

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
   * Role이 없는 경우 기본 USER 역할을 자동 할당
   * @throws NotFoundException User가 존재하지 않는 경우
   */
  async findByIdWithRole(
    userId: string,
  ): Promise<{ user: User; role: Role | null }> {
    this.logger.debug(`[findByIdWithRole] 시작 - userId: ${userId}`);

    const user = await this.userRepo.findById(userId);
    if (!user) {
      this.logger.warn(`[findByIdWithRole] User를 찾을 수 없음 - userId: ${userId}`);
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    this.logger.debug(
      `[findByIdWithRole] User 조회 성공 - userId: ${user.id}, isActive: ${user.isActive}, roleId: ${user.roleId ?? 'null'}`,
    );

    let role: Role | null = null;

    // 기존 Role이 있는 경우
    if (user.roleId) {
      this.logger.debug(`[findByIdWithRole] 기존 roleId 존재 - roleId: ${user.roleId}`);
      role = await this.roleRepo.findById(user.roleId);

      if (role) {
        this.logger.debug(
          `[findByIdWithRole] 기존 Role 조회 성공 - roleId: ${role.id}, roleName: ${role.name}`,
        );
      } else {
        this.logger.warn(
          `[findByIdWithRole] 기존 roleId에 해당하는 Role을 찾을 수 없음 - roleId: ${user.roleId}. 기본 역할 할당 시도`,
        );
      }
    }

    // Role이 없는 경우 기본 USER 역할 자동 할당
    if (!role) {
      this.logger.log(
        `[findByIdWithRole] Role이 없음 - 기본 ${RoleNameEnum.USER} 역할 자동 할당 시작 - userId: ${userId}`,
      );

      const defaultRole = await this.roleRepo.findByName(RoleNameEnum.USER);

      if (!defaultRole) {
        this.logger.error(
          `[findByIdWithRole] 기본 역할(${RoleNameEnum.USER})을 찾을 수 없음. 시스템 초기화가 필요합니다.`,
        );
        return { user, role: null };
      }

      this.logger.debug(
        `[findByIdWithRole] 기본 역할 조회 성공 - roleId: ${defaultRole.id}, roleName: ${defaultRole.name}`,
      );

      // 활성 사용자인 경우에만 역할 자동 할당
      if (user.isActive) {
        this.logger.log(
          `[findByIdWithRole] 활성 사용자에게 기본 역할 할당 - userId: ${userId}, roleId: ${defaultRole.id}, roleName: ${defaultRole.name}`,
        );

        user.assignRole(defaultRole.id);
        const savedUser = await this.userRepo.save(user);

        this.logger.log(
          `[findByIdWithRole] 기본 역할 할당 완료 - userId: ${savedUser.id}, roleId: ${savedUser.roleId}, updatedAt: ${savedUser.updatedAt}`,
        );

        role = defaultRole;
      } else {
        this.logger.warn(
          `[findByIdWithRole] 비활성 사용자 - 기본 역할 자동 할당 건너뜀 - userId: ${userId}, isActive: ${user.isActive}`,
        );
      }
    }

    this.logger.debug(
      `[findByIdWithRole] 완료 - userId: ${user.id}, roleId: ${role?.id ?? 'null'}, roleName: ${role?.name ?? 'null'}`,
    );

    return { user, role };
  }
}
