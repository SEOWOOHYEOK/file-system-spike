import { EmployeeStatus } from '../../../integrations/migration/organization/entities/employee.entity';

/**
 * 부서-직책 정보
 */
export interface DepartmentPositionInfo {
  departmentId: string;
  departmentName: string;
  positionId: string;
  positionTitle: string;
  isManager: boolean;
}

/**
 * Employee 정보 DTO
 */
export interface EmployeeInfo {
  employeeNumber: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  hireDate: Date;
  status: EmployeeStatus;
  departmentPositions: DepartmentPositionInfo[];
}

/**
 * User + Employee 정보 응답 DTO
 */
export interface UserWithEmployeeDto {
  id: string;
  isActive: boolean;
  roleId: string | null;
  employee: EmployeeInfo | null;
  createdAt: Date;
  updatedAt: Date;
}
