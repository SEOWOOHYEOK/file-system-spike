import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * 조직 데이터 마이그레이션 요청 DTO
 */
export class MigrateOrganizationRequestDto {
    @ApiPropertyOptional({
        description: '퇴사자 포함 여부',
        example: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    includeTerminated?: boolean;

    @ApiPropertyOptional({
        description: '비활성 부서 포함 여부',
        example: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    includeInactiveDepartments?: boolean;
}

/**
 * 조직 데이터 마이그레이션 통계 DTO
 */
export class MigrationStatisticsDto {
    @ApiProperty({ description: '직급 개수', example: 10 })
    ranks: number;

    @ApiProperty({ description: '직책 개수', example: 15 })
    positions: number;

    @ApiProperty({ description: '부서 개수', example: 50 })
    departments: number;

    @ApiProperty({ description: '직원 수', example: 200 })
    employees: number;

    @ApiProperty({ description: '직원-부서-직책 배정 개수', example: 180 })
    employeeDepartmentPositions: number;

    @ApiProperty({ description: '발령 이력 개수', example: 500 })
    assignmentHistories: number;
}

/**
 * 조직 데이터 마이그레이션 응답 DTO
 */
export class MigrateOrganizationResponseDto {
    @ApiProperty({ description: '마이그레이션 성공 여부', example: true })
    success: boolean;

    @ApiProperty({ description: '마이그레이션 통계', type: MigrationStatisticsDto })
    statistics: MigrationStatisticsDto;

    @ApiPropertyOptional({ description: 'SSO에서 조회한 조직 데이터' })
    data?: {
        ranks: any[];
        positions: any[];
        departments: any[];
        employees: any[];
        employeeDepartmentPositions: any[];
        assignmentHistories: any[];
    };
}
