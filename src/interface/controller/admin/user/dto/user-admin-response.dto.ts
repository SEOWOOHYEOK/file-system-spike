import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Role 정보 응답 DTO
 */
export class RoleInfoDto {
  @ApiProperty({ description: 'Role ID' })
  id: string;

  @ApiProperty({ description: 'Role 이름' })
  name: string;

  @ApiProperty({ description: '권한 목록', type: [String] })
  permissions: string[];
}

/**
 * User + Role 응답 DTO
 */
export class UserWithRoleResponseDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: '활성화 여부' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Role 정보', type: RoleInfoDto, nullable: true })
  role: RoleInfoDto | null;

  @ApiProperty({ description: '생성일시' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt: Date;
}

/**
 * User + Employee 응답 DTO
 */
export class UserWithEmployeeResponseDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: '활성화 여부' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Role ID' })
  roleId?: string;

  @ApiPropertyOptional({ description: '직원 이름' })
  employeeName?: string;

  @ApiPropertyOptional({ description: '사번' })
  employeeNumber?: string;

  @ApiPropertyOptional({ description: '부서' })
  departmentName?: string;

  @ApiPropertyOptional({ description: '직급' })
  positionName?: string;

  @ApiPropertyOptional({ description: '재직 상태' })
  status?: string;

  @ApiProperty({ description: '생성일시' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt: Date;
}
