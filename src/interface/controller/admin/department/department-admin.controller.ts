import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentQueryService } from '../../../../business/department/department-query.service';
import { DepartmentHierarchyResponseDto } from './dto/department-hierarchy-response.dto';
import { ApiGetDepartmentHierarchy } from './department-admin.swagger';
import { UnifiedJwtAuthGuard } from '../../../../common/guards/unified-jwt-auth.guard';
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../../domain/role/permission.enum';

/**
 * 부서 정보 Admin API 컨트롤러
 *
 * 관리자 전용: 부서 계층 구조 조회
 * departments-info 테이블의 parentDepartmentId, order를 기반으로 트리 구조 반환
 */
@ApiTags('820.관리자 - 부서 정보')
@ApiBearerAuth()
@Controller('v1/admin/departments')
@UseGuards(UnifiedJwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.USER_READ)
export class DepartmentAdminController {
  constructor(
    private readonly departmentQueryService: DepartmentQueryService,
  ) {}

  /**
   * 부서 계층 구조 조회
   * GET /v1/admin/departments
   *
   * departments-info 테이블에서 전체 부서를 트리 구조로 반환
   * order 오름차순 정렬 (0이 가장 위)
   */
  @Get()
  @ApiGetDepartmentHierarchy()
  async getDepartmentHierarchy(): Promise<DepartmentHierarchyResponseDto[]> {
    return this.departmentQueryService.getDepartmentHierarchy();
  }
}
