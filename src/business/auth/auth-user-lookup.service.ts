import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { UserDomainService } from '../../domain/user/service/user-domain.service';
import { RoleDomainService } from '../../domain/role/service/role-domain.service';
import { DomainEmployeeService } from '../../integrations/migration/organization/services/employee.service';
import { RoleNameEnum } from '../../domain/role/role-name.enum';
import { UserType } from '../../domain/audit/enums/common.enum';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { BusinessException, ErrorCodes } from '../../common/exceptions';

/**
 * AuthUserLookupService
 *
 * Guard에서 JWT 검증 후 사용자 DB 조회를 담당합니다.
 * - 내부 사용자: User(isActive) + Employee(name, email) 조회
 * - 외부 사용자: User의 Role이 GUEST인 사용자 + Employee(name, email) 조회
 *
 * 조회 실패 또는 비활성 사용자는 예외를 발생시킵니다.
 */
@Injectable()
export class AuthUserLookupService {
  private readonly logger = new Logger(AuthUserLookupService.name);

  constructor(
    private readonly userDomainService: UserDomainService,
    private readonly roleDomainService: RoleDomainService,
    private readonly employeeService: DomainEmployeeService,
  ) {}

  /**
   * 내부 사용자 조회
   *
   * User 테이블에서 isActive 확인 후, Employee 테이블에서 상세 정보를 가져옵니다.
   * User와 Employee는 동일한 ID를 공유합니다 (1:1 매핑).
   *
   * @throws UnauthorizedException 사용자를 찾을 수 없는 경우
   * @throws ForbiddenException 계정이 비활성화된 경우
   */
  async lookupInternal(userId: string): Promise<AuthenticatedUser> {
    const [user, employee] = await Promise.all([
      this.userDomainService.조회(userId),
      this.employeeService.findOne(userId),
    ]);

    if (!user || !employee) {
      this.logger.warn(`내부 사용자 조회 실패: userId=${userId}`);
      throw BusinessException.of(ErrorCodes.AUTH_USER_NOT_FOUND, { userId });
    }

    if (!user.isActive) {
      throw BusinessException.of(ErrorCodes.AUTH_ACCOUNT_DISABLED, { userId });
    }

    return {
      id: user.id,
      type: UserType.INTERNAL,
      name: employee.name,
      email: employee.email ?? '',
      isActive: user.isActive,
      employeeNumber: employee.employeeNumber,
    };
  }

  /**
   * 외부 사용자 조회
   *
   * User 테이블에서 role_id를 확인하고, roles 테이블에서 해당 Role의 name이 GUEST인지 검증합니다.
   * GUEST Role이 아닌 경우 AUTH_DEPARTMENT_MISMATCH 예외를 발생시킵니다.
   *
   * @throws UnauthorizedException 사용자를 찾을 수 없는 경우
   * @throws ForbiddenException GUEST Role이 아닌 경우 (Role 변경됨)
   */
  async lookupExternal(userId: string): Promise<AuthenticatedUser> {
    const [user, employee] = await Promise.all([
      this.userDomainService.조회(userId),
      this.employeeService.findOne(userId),
    ]);

    if (!user || !employee) {
      this.logger.warn(`외부 사용자 조회 실패: userId=${userId}`);
      throw BusinessException.of(ErrorCodes.AUTH_USER_NOT_FOUND, { userId });
    }

    // Role 검증: GUEST Role이어야 외부 사용자
    if (!user.roleId) {
      this.logger.warn(`외부 사용자 Role 미할당: userId=${userId}`);
      throw BusinessException.of(ErrorCodes.AUTH_DEPARTMENT_MISMATCH, { userId });
    }

    const role = await this.roleDomainService.조회(user.roleId);
    if (!role || role.name !== RoleNameEnum.GUEST) {
      this.logger.warn(`GUEST Role이 아님 - Role 변경됨: userId=${userId}, roleName=${role?.name ?? 'null'}`);
      throw BusinessException.of(ErrorCodes.AUTH_DEPARTMENT_MISMATCH, { userId });
    }

    return {
      id: employee.id,
      type: UserType.EXTERNAL,
      name: employee.name,
      email: employee.email ?? '',
      isActive: user.isActive,
      employeeNumber: employee.employeeNumber,
    };
  }
}
