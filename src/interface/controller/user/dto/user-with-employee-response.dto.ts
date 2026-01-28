import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus } from '../../../../integrations/migration/organization/entities/employee.entity';

/**
 * 부서-직책 정보 응답
 */
export class DepartmentPositionResponseDto {
  @ApiProperty({ description: '부서 ID' })
  departmentId: string;

  @ApiProperty({ description: '부서명' })
  departmentName: string;

  @ApiProperty({ description: '직책 ID' })
  positionId: string;

  @ApiProperty({ description: '직책명' })
  positionTitle: string;

  @ApiProperty({ description: '관리자 여부' })
  isManager: boolean;
}

/**
 * Employee 정보 응답
 */
export class EmployeeInfoResponseDto {
  @ApiProperty({ description: '사번' })
  employeeNumber: string;

  @ApiProperty({ description: '이름' })
  name: string;

  @ApiPropertyOptional({ description: '이메일' })
  email?: string;

  @ApiPropertyOptional({ description: '전화번호' })
  phoneNumber?: string;

  @ApiProperty({ description: '입사일' })
  hireDate: Date;

  @ApiProperty({ description: '재직 상태', enum: EmployeeStatus })
  status: EmployeeStatus;

  @ApiProperty({ description: '부서-직책 목록', type: [DepartmentPositionResponseDto] })
  departmentPositions: DepartmentPositionResponseDto[];
}

/**
 * User + Employee 정보 응답 DTO
 *
 * GET /users API 응답용
 */
export class UserWithEmployeeResponseDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: '활성 상태' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Role ID' })
  roleId: string | null;

  @ApiPropertyOptional({ description: 'Employee 정보', type: EmployeeInfoResponseDto })
  employee: EmployeeInfoResponseDto | null;

  @ApiProperty({ description: '생성일' })
  createdAt: Date;

  @ApiProperty({ description: '수정일' })
  updatedAt: Date;
}
