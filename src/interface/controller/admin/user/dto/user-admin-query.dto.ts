import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { EmployeeStatus } from '../../../../../integrations/migration/organization/entities/employee.entity';

/**
 * User 목록 필터 쿼리 DTO
 */
export class UserFilterQueryDto {
  @ApiPropertyOptional({ description: '직원 이름 (부분 일치)' })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiPropertyOptional({ description: '사번 (부분 일치)' })
  @IsOptional()
  @IsString()
  employeeNumber?: string;

  @ApiPropertyOptional({ description: '재직 상태', enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}
