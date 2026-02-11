import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ApproverItem } from '../../../../business/user/user-query.service';

/**
 * 승인자 역할 응답 DTO
 */
export class ApproverRoleDto {
  @ApiProperty({ description: '역할 ID', example: '550e8400-e29b-41d4-a716-446655440010' })
  id: string;

  @ApiProperty({ description: '역할 이름', example: 'MANAGER' })
  name: string;

  @ApiPropertyOptional({ description: '역할 설명', example: '매니저' })
  description: string | null;
}

/**
 * 승인자 응답 DTO
 *
 * 매니저 이상 역할을 가진 사용자 정보를 반환합니다.
 * 공유 요청 생성 시 승인 대상자를 선택하기 위해 사용됩니다.
 */
export class ApproverResponseDto {
  @ApiProperty({
    description: '사용자 ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  id: string;

  @ApiProperty({ description: '이름', example: '김매니저' })
  name: string;

  @ApiProperty({ description: '이메일', example: 'kim@company.com' })
  email: string;

  @ApiProperty({ description: '사번', example: 'EMP001' })
  employeeNumber: string;

  @ApiPropertyOptional({ description: '부서명', example: '개발팀' })
  departmentName: string | null;

  @ApiPropertyOptional({ description: '직책', example: '팀장' })
  positionName: string | null;

  @ApiProperty({ description: '역할 정보', type: ApproverRoleDto })
  role: ApproverRoleDto;

  /**
   * ApproverItem으로부터 응답 DTO 생성
   */
  static fromItem(item: ApproverItem): ApproverResponseDto {
    const dto = new ApproverResponseDto();
    dto.id = item.id;
    dto.name = item.name;
    dto.email = item.email;
    dto.employeeNumber = item.employeeNumber;
    dto.departmentName = item.departmentName;
    dto.positionName = item.positionName;
    dto.role = {
      id: item.role.id,
      name: item.role.name,
      description: item.role.description,
    };
    return dto;
  }
}
