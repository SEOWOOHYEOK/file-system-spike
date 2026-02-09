import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { UserDomainService } from '../../domain/user/service/user-domain.service';
import { ExternalUserDomainService } from '../../domain/external-share';
import { DomainEmployeeService } from '../../integrations/migration/organization/services/employee.service';
import { UserType } from '../../domain/audit/enums/common.enum';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';

/**
 * AuthUserLookupService
 *
 * Guard에서 JWT 검증 후 사용자 DB 조회를 담당합니다.
 * - 내부 사용자: User(isActive) + Employee(name, email) 조회
 * - 외부 사용자: ExternalUser 조회
 *
 * 조회 실패 또는 비활성 사용자는 예외를 발생시킵니다.
 */
@Injectable()
export class AuthUserLookupService {
  private readonly logger = new Logger(AuthUserLookupService.name);

  constructor(
    private readonly userDomainService: UserDomainService,
    private readonly employeeService: DomainEmployeeService,
    private readonly externalUserDomainService: ExternalUserDomainService,
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
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    if (!user.isActive) {
      throw new ForbiddenException('계정이 비활성화되었습니다.');
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
   * ExternalUser 테이블에서 사용자 정보를 가져옵니다.
   *
   * @throws UnauthorizedException 사용자를 찾을 수 없는 경우
   * @throws ForbiddenException 계정이 비활성화된 경우
   */
  async lookupExternal(userId: string): Promise<AuthenticatedUser> {
    const externalUser = await this.externalUserDomainService.조회(userId);

    if (!externalUser) {
      this.logger.warn(`외부 사용자 조회 실패: userId=${userId}`);
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    if (!externalUser.isActive) {
      throw new ForbiddenException('계정이 비활성화되었습니다.');
    }

    return {
      id: externalUser.id,
      type: UserType.EXTERNAL,
      name: externalUser.name,
      email: externalUser.email,
      isActive: externalUser.isActive,
      username: externalUser.username,
      company: externalUser.company,
    };
  }
}
