import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from '../../../../business/user/user.service';
import { UserSyncService, SyncResult } from '../../../../business/user/user-sync.service';
import { UserQueryService } from '../../../../business/user/user-query.service';
import { User } from '../../../../domain/user/entities/user.entity';
import { AssignRoleDto } from '../../../../domain/user/dto/assign-role.dto';
import { UserFilterQueryDto } from './dto/user-admin-query.dto';
import { UserWithEmployeeResponseDto, UserWithRoleResponseDto } from './dto/user-admin-response.dto';
import { EmployeeStatus } from '../../../../integrations/migration/organization/entities/employee.entity';
import { AuditAction } from '../../../../common/decorators/audit-action.decorator';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';

/**
 * User 관리 Admin API 컨트롤러
 *
 * 관리자 전용: User 목록 조회, Role 부여/제거, Employee 동기화
 */
@ApiTags('100.Admin - User 관리')
@ApiBearerAuth()
@Controller('v1/admin/users')
export class UserAdminController {
  constructor(
    private readonly userService: UserService,
    private readonly userSyncService: UserSyncService,
    private readonly userQueryService: UserQueryService,
  ) {}

  /**
   * 전체 User 목록 조회 (Employee 정보 포함 + 필터링)
   * GET /admin/users?employeeName=홍길동&employeeNumber=EMP001&status=재직중
   */
  @Get()
  @ApiOperation({ summary: '전체 User 목록 조회 (Employee 정보 포함)' })
  @ApiQuery({ name: 'employeeName', required: false, description: '이름 (부분 일치)' })
  @ApiQuery({ name: 'employeeNumber', required: false, description: '사번 (부분 일치)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: EmployeeStatus,
    description: '재직 상태',
  })
  @ApiResponse({ status: 200, description: 'User + Employee 목록 반환' })
  async findAll(
    @Query() filter: UserFilterQueryDto,
  ): Promise<UserWithEmployeeResponseDto[]> {
    return this.userQueryService.findAllWithEmployee(filter);
  }

  /**
   * 특정 User 조회 (Role 포함)
   * GET /admin/users/:id
   */
  @Get(':id')
  @ApiOperation({ summary: '특정 User 조회 (Role 포함)' })
  @ApiResponse({ status: 200, description: 'User 정보 반환' })
  @ApiResponse({ status: 404, description: 'User를 찾을 수 없음' })
  async findById(@Param('id') id: string): Promise<UserWithRoleResponseDto> {
    const { user, role } = await this.userService.findByIdWithRole(id);

    return {
      id: user.id,
      isActive: user.isActive,
      role: role
        ? {
            id: role.id,
            name: role.name,
            permissions: role.permissions.map((p) => p.code),
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * User에게 Role 부여
   * PATCH /admin/users/:id/role
   */
  @Patch(':id/role')
  @AuditAction({
    action: AuditActionEnum.USER_ROLE_ASSIGN,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  @ApiOperation({ summary: 'User에게 Role 부여' })
  @ApiResponse({ status: 200, description: 'Role 부여 완료' })
  @ApiResponse({ status: 404, description: 'User 또는 Role을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '비활성 User에게 Role 부여 불가' })
  async assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ): Promise<User> {
    return this.userService.assignRole(id, dto.roleId);
  }

  /**
   * User의 Role 제거
   * DELETE /admin/users/:id/role
   */
  @Delete(':id/role')
  @AuditAction({
    action: AuditActionEnum.USER_ROLE_REMOVE,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  @ApiOperation({ summary: 'User의 Role 제거' })
  @ApiResponse({ status: 200, description: 'Role 제거 완료' })
  @ApiResponse({ status: 404, description: 'User를 찾을 수 없음' })
  async removeRole(@Param('id') id: string): Promise<User> {
    return this.userService.removeRole(id);
  }

  /**
   * Employee → User 동기화
   * POST /admin/users/sync
   *
   * Admin 권한 필요
   */
  @Post('sync')
  @AuditAction({
    action: AuditActionEnum.USER_SYNC,
    targetType: TargetType.SYSTEM,
  })
  @ApiOperation({ summary: 'Employee → User 동기화 실행' })
  @ApiResponse({ status: 200, description: '동기화 결과 반환' })
  async syncUsers(): Promise<SyncResult> {
    return this.userSyncService.syncEmployeesToUsers();
  }
}
