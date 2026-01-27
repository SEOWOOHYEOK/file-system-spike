import { EmployeeStatus } from '../../../integrations/migration/organization/entities/employee.entity';

/**
 * User 목록 필터링 DTO
 *
 * GET /users?name=홍길동&employeeNumber=EMP001&status=재직중
 */
export class UserFilterDto {
  /** 이름 (부분 일치) */
  name?: string;

  /** 사번 (부분 일치) */
  employeeNumber?: string;

  /** 재직 상태 */
  status?: EmployeeStatus;
}
