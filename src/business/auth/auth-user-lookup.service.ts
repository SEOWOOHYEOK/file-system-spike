import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDomainService } from '../../domain/user/service/user-domain.service';
import { DomainEmployeeService } from '../../integrations/migration/organization/services/employee.service';
import { EmployeeDepartmentPosition } from '../../integrations/migration/organization/entities/employee-department-position.entity';
import { UserType } from '../../domain/audit/enums/common.enum';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { BusinessException, ErrorCodes } from '../../common/exceptions';

/**
 * AuthUserLookupService
 *
 * Guard에서 JWT 검증 후 사용자 DB 조회를 담당합니다.
 * - 내부 사용자: User(isActive) + Employee(name, email) 조회
 * - 외부 사용자: Employee + employee_department_positions (EXTERNAL_DEPARTMENT_ID 소속) 조회
 *
 * 조회 실패 또는 비활성 사용자는 예외를 발생시킵니다.
 */
@Injectable()
export class AuthUserLookupService {
  private readonly logger = new Logger(AuthUserLookupService.name);

  constructor(
    private readonly userDomainService: UserDomainService,
    private readonly employeeService: DomainEmployeeService,
    private readonly configService: ConfigService,
    @InjectRepository(EmployeeDepartmentPosition)
    private readonly edpRepository: Repository<EmployeeDepartmentPosition>,
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
   * Employee 테이블에서 사용자 정보를 가져오고,
   * employee_department_positions로 EXTERNAL_DEPARTMENT_ID 부서 소속 여부를 검증합니다.
   * 부서 이동 등으로 해당 부서에 없으면 AUTH_ACCOUNT_DISABLED 예외를 발생시킵니다.
   *
   * @throws UnauthorizedException 사용자를 찾을 수 없는 경우
   * @throws ForbiddenException 해당 부서(EXTERNAL_DEPARTMENT_ID) 소속이 아닌 경우 (부서 이동됨)
   */
  async lookupExternal(userId: string): Promise<AuthenticatedUser> {
    const externalDepartmentId = this.configService.get<string>('EXTERNAL_DEPARTMENT_ID');
    if (!externalDepartmentId) {
      this.logger.error('EXTERNAL_DEPARTMENT_ID 환경변수가 설정되지 않았습니다.');
      throw BusinessException.of(ErrorCodes.AUTH_CONFIG_ERROR);
    }

    const employee = await this.employeeService.findOne(userId);
    if (!employee) {
      this.logger.warn(`외부 사용자(직원) 조회 실패: userId=${userId}`);
      throw BusinessException.of(ErrorCodes.AUTH_USER_NOT_FOUND, { userId });
    }

    const position = await this.edpRepository.findOne({
      where: { employeeId: userId, departmentId: externalDepartmentId },
      relations: ['department'],
    });

    if (!position || !position.department) {
      this.logger.warn(`외부 부서(EXTERNAL_DEPARTMENT_ID) 소속 아님 - 부서 이동됨: userId=${userId}`);
      throw BusinessException.of(ErrorCodes.AUTH_DEPARTMENT_MISMATCH, { userId });
    }

    return {
      id: employee.id,
      type: UserType.EXTERNAL,
      name: employee.name,
      email: employee.email ?? '',
      isActive: true,
      employeeNumber: employee.employeeNumber,
      departmentId: position.department.id,
      departmentName: position.department.departmentName,
    };
  }
}
