import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { User } from '../../domain/user/entities/user.entity';
import { Role } from '../../domain/role/entities/role.entity';
import { RoleNameEnum } from '../../domain/role/role-name.enum';
import { UserDomainService } from '../../domain/user';
import { RoleDomainService } from '../../domain/role';

/**
 * User 비즈니스 서비스
 *
 * User CRUD 및 Role 부여/제거 담당
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userDomainService: UserDomainService,
    private readonly roleDomainService: RoleDomainService,
  ) {}

  /**
   * 전체 User 목록 조회
   */
  async findAll(): Promise<User[]> {
    return this.userDomainService.전체조회();
  }

  /**
   * ID로 User 조회
   * @throws NotFoundException User가 존재하지 않는 경우
   */
  async findById(id: string): Promise<User> {
    const user = await this.userDomainService.조회(id);
    if (!user) {
      throw BusinessException.of(ErrorCodes.USER_NOT_FOUND, { userId: id });
    }
    return user;
  }

  /**
   * User에게 Role 부여
   * @throws NotFoundException User 또는 Role이 존재하지 않는 경우
   * @throws BadRequestException User가 비활성 상태인 경우
   */
  async assignRole(userId: string, roleId: string): Promise<User> {
    const user = await this.userDomainService.조회(userId);
    if (!user) {
      throw BusinessException.of(ErrorCodes.USER_NOT_FOUND, { userId });
    }

    if (!user.isActive) {
      throw BusinessException.of(ErrorCodes.USER_INACTIVE_ROLE_ASSIGN, { userId, roleId });
    }

    const role = await this.roleDomainService.조회(roleId);
    if (!role) {
      throw BusinessException.of(ErrorCodes.USER_ROLE_NOT_FOUND, { roleId });
    }

    user.assignRole(roleId);
    return this.userDomainService.저장(user);
  }

  /**
   * User의 Role 제거
   * @throws NotFoundException User가 존재하지 않는 경우
   */
  async removeRole(userId: string): Promise<User> {
    const user = await this.userDomainService.조회(userId);
    if (!user) {
      throw BusinessException.of(ErrorCodes.USER_NOT_FOUND, { userId });
    }

    user.removeRole();
    return this.userDomainService.저장(user);
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

    const user = await this.userDomainService.조회(userId);
    if (!user) {
      this.logger.warn(`[findByIdWithRole] User를 찾을 수 없음 - userId: ${userId}`);
      throw BusinessException.of(ErrorCodes.USER_NOT_FOUND, { userId });
    }

    this.logger.debug(
      `[findByIdWithRole] User 조회 성공 - userId: ${user.id}, isActive: ${user.isActive}, roleId: ${user.roleId ?? 'null'}`,
    );

    let role: Role | null = null;

    // 기존 Role이 있는 경우
    if (user.roleId) {
      this.logger.debug(`[findByIdWithRole] 기존 roleId 존재 - roleId: ${user.roleId}`);
      role = await this.roleDomainService.조회(user.roleId);

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

      const defaultRole = await this.roleDomainService.이름조회(RoleNameEnum.USER);

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
        const savedUser = await this.userDomainService.저장(user);

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
