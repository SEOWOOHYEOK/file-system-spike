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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from '../../../../business/user/user.service';
import { UserSyncService, SyncResult } from '../../../../business/user/user-sync.service';
import { UserQueryService } from '../../../../business/user/user-query.service';
import { User } from '../../../../domain/user/entities/user.entity';
import { AssignRoleDto } from '../../../../domain/user/dto/assign-role.dto';
import { UserFilterQueryDto } from './dto/user-admin-query.dto';
import { UserWithEmployeeResponseDto, UserWithRoleResponseDto } from './dto/user-admin-response.dto';
import { AuditAction } from '../../../../common/decorators/audit-action.decorator';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';
import {
  ApiFindAllUsers,
  ApiFindUserById,
  ApiAssignRole,
  ApiRemoveRole,
  ApiSyncUsers,
} from './user-admin.swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../../domain/role/permission.enum';

/**
 * User 관리 Admin API 컨트롤러
 *
 * 관리자 전용: User 목록 조회, Role 부여/제거, Employee 동기화
 * ADMIN 권한이 있는 내부 사용자만 접근 가능
 */
@ApiTags('810.관리자 - 사용자 역할 부여 관리')
@ApiBearerAuth()
@Controller('v1/admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.USER_READ)
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
  @ApiFindAllUsers()
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
  @ApiFindUserById()
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
  @RequirePermissions(PermissionEnum.USER_WRITE)
  @AuditAction({
    action: AuditActionEnum.USER_ROLE_ASSIGN,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  @ApiAssignRole()
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
  @RequirePermissions(PermissionEnum.USER_WRITE)
  @AuditAction({
    action: AuditActionEnum.USER_ROLE_REMOVE,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  @ApiRemoveRole()
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
  @RequirePermissions(PermissionEnum.USER_WRITE)
  @AuditAction({
    action: AuditActionEnum.USER_SYNC,
    targetType: TargetType.SYSTEM,
  })
  @ApiSyncUsers()
  async syncUsers(): Promise<SyncResult> {
    return this.userSyncService.syncEmployeesToUsers();
  }
}
