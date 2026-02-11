import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { RoleNameEnum } from '../../../domain/role/role-name.enum';
import { UserService } from '../../user/user.service';

/**
 * 권한 검사 Guard
 *
 * User 테이블 기반으로 권한 검사 수행
 * - User.isActive가 false면 차단
 * - User.roleId가 null이면 차단
 * - ADMIN 역할이면 모든 권한 자동 통과
 * - Role의 permissions에 필요 권한이 없으면 차단
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionEnum[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredPermissions) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.id) return false;

    try {
      // User 조회 (Role 포함)
      const { user: foundUser, role } = await this.userService.findByIdWithRole(user.id);

      // 비활성 User 차단
      if (!foundUser.isActive) return false;

      // Role 없는 User 차단
      if (!foundUser.roleId || !role) return false;

      // ADMIN 역할은 모든 권한 자동 통과
      if (role.name === RoleNameEnum.ADMIN) return true;

      // Permission 추출
      const userPermissions = role.permissions.map((p) => p.code as PermissionEnum);

      // 권한 체크
      return requiredPermissions.every((permission) =>
        userPermissions.includes(permission),
      );
    } catch {
      // User가 존재하지 않거나 조회 실패 시 차단
      return false;
    }
  }
}
