import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 부서 계층 구조 응답 DTO
 *
 * departments-info 테이블의 order 기준으로 정렬된 트리 구조
 * order 값이 낮을수록 상위에 표시 (0이 가장 위)
 */
export class DepartmentHierarchyResponseDto {
  @ApiProperty({ description: '부서 ID', example: 'dept-uuid-001' })
  id: string;

  @ApiProperty({ description: '부서명', example: '연구개발본부' })
  departmentName: string;

  @ApiProperty({ description: '부서 코드', example: 'RND_DIV' })
  departmentCode: string;

  @ApiProperty({
    description: '부서 유형',
    enum: ['COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM'],
    example: 'DIVISION',
  })
  type: string;

  @ApiProperty({ description: '정렬 순서 (낮을수록 상위)', example: 0 })
  order: number;

  @ApiProperty({ description: '소속 인원 수', example: 64 })
  memberCount: number;

  @ApiPropertyOptional({
    description: '상위 부서 ID (최상위 부서는 null)',
    example: 'dept-uuid-parent',
    nullable: true,
  })
  parentDepartmentId: string | null;

  @ApiProperty({
    description: '하위 부서 목록 (재귀 구조, order 오름차순 정렬)',
    type: () => [DepartmentHierarchyResponseDto],
    default: [],
  })
  children: DepartmentHierarchyResponseDto[];
}
