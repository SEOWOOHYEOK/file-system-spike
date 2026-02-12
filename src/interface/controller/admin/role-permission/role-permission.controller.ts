import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleService } from '../../../../business/role/role.service';
import { UnifiedJwtAuthGuard } from '../../../../common/guards/unified-jwt-auth.guard';
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum, PermissionDescriptions } from '../../../../domain/role/permission.enum';
import { AuditAction } from '../../../../common/decorators/audit-action.decorator';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';
import { AddPermissionDto } from './dto/add-permission.dto';
import {
  RolePermissionResponseDto,
  PermissionCategoryDto,
} from './dto/role-permission-response.dto';
import {
  FindAllRolePermissionsSwagger,
  FindRolePermissionsSwagger,
  AddPermissionToRoleSwagger,
  RemovePermissionFromRoleSwagger,
  FindAllPermissionsSwagger,
} from './role-permission.swagger';

/**
 * 카테고리별 권한 분류 매핑
 *
 * 권한 코드 prefix를 기반으로 카테고리를 결정합니다.
 */
const PERMISSION_CATEGORIES: { category: string; prefixes: string[] }[] = [
  { category: 'User Management', prefixes: ['USER_'] },
  { category: 'Role Management', prefixes: ['ROLE_'] },
  { category: 'Audit & Monitoring', prefixes: ['AUDIT_', 'SYSTEM_', 'SYNC_'] },
  // File Request/Approval을 File Management보다 먼저 배치해야
  // FILE_MOVE_REQUEST가 FILE_MOVE prefix에 잘못 매칭되지 않습니다.
  {
    category: 'File Request/Approval',
    prefixes: ['FILE_MOVE_REQUEST', 'FILE_MOVE_APPROVE', 'FILE_DELETE_REQUEST', 'FILE_DELETE_APPROVE'],
  },
  {
    category: 'File Management',
    prefixes: ['FILE_READ', 'FILE_WRITE', 'FILE_DELETE', 'FILE_UPLOAD', 'FILE_DOWNLOAD', 'FILE_MOVE'],
  },
  { category: 'Trash & Recovery', prefixes: ['TRASH_', 'FILE_PURGE', 'FILE_RESTORE'] },
  { category: 'Share Management', prefixes: ['FILE_SHARE_', 'SHARE_LOG_'] },
  { category: 'External Share Access', prefixes: ['EXTERNAL_SHARE_'] },
  { category: 'Folder Management', prefixes: ['FOLDER_'] },
];

/**
 * 권한 코드로 카테고리를 찾는 함수
 *
 * File Request/Approval 카테고리를 먼저 검사하여
 * FILE_MOVE_REQUEST가 File Management에 잘못 분류되지 않도록 합니다.
 */
function findCategory(code: string): string {
  // 더 구체적인 prefix를 먼저 검사 (File Request/Approval)
  for (const { category, prefixes } of PERMISSION_CATEGORIES) {
    for (const prefix of prefixes) {
      if (code === prefix || code.startsWith(prefix)) {
        return category;
      }
    }
  }
  return 'Other';
}

/**
 * 역할별 권한 매핑 관리 Admin API 컨트롤러
 *
 * 관리자 전용: 역할별 권한 조회, 권한 추가/제거
 * ROLE_READ/ROLE_WRITE 권한 필요
 */
@ApiTags('809.관리자 - 역할별 권한 매핑 관리')
@ApiBearerAuth()
@Controller('v1/admin/role-permissions')
@UseGuards(UnifiedJwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.ROLE_READ)
export class RolePermissionController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * 전체 역할별 권한 매트릭스 조회
   * GET /v1/admin/role-permissions
   */
  @Get()
  @FindAllRolePermissionsSwagger()
  async findAllRolePermissions(): Promise<RolePermissionResponseDto[]> {
    const roles = await this.roleService.findAll();

    return roles.map((role) => ({
      roleId: role.id,
      roleName: role.name,
      roleDescription: role.description ?? '',
      permissions: role.permissions.map((p) => ({
        code: p.code,
        description: p.description ?? PermissionDescriptions[p.code as PermissionEnum] ?? '',
      })),
    }));
  }

  /**
   * 시스템 전체 권한 목록 조회 (카테고리별)
   * GET /v1/admin/role-permissions/permissions
   */
  @Get('permissions')
  @FindAllPermissionsSwagger()
  async findAllPermissions(): Promise<PermissionCategoryDto[]> {
    const permissions = await this.roleService.findAllPermissions();

    // 카테고리별로 그룹핑
    const categoryMap = new Map<string, { code: string; description: string }[]>();

    for (const permission of permissions) {
      const category = findCategory(permission.code);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push({
        code: permission.code,
        description:
          permission.description ?? PermissionDescriptions[permission.code as PermissionEnum] ?? '',
      });
    }

    // PERMISSION_CATEGORIES 순서 유지
    const result: PermissionCategoryDto[] = [];
    for (const { category } of PERMISSION_CATEGORIES) {
      const perms = categoryMap.get(category);
      if (perms && perms.length > 0) {
        result.push({ category, permissions: perms });
      }
    }

    // Other 카테고리 (분류되지 않은 것)
    const otherPerms = categoryMap.get('Other');
    if (otherPerms && otherPerms.length > 0) {
      result.push({ category: 'Other', permissions: otherPerms });
    }

    return result;
  }

  /**
   * 특정 역할의 권한 목록 조회
   * GET /v1/admin/role-permissions/:roleId
   */
  @Get(':roleId')
  @FindRolePermissionsSwagger()
  async findRolePermissions(
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<RolePermissionResponseDto> {
    const role = await this.roleService.findById(roleId);

    return {
      roleId: role.id,
      roleName: role.name,
      roleDescription: role.description ?? '',
      permissions: role.permissions.map((p) => ({
        code: p.code,
        description: p.description ?? PermissionDescriptions[p.code as PermissionEnum] ?? '',
      })),
    };
  }

  /**
   * 역할에 권한 추가
   * POST /v1/admin/role-permissions/:roleId/permissions
   */
  @Post(':roleId/permissions')
  @RequirePermissions(PermissionEnum.ROLE_WRITE)
  @AuditAction({
    action: AuditActionEnum.PERMISSION_GRANT,
    targetType: TargetType.SYSTEM,
    targetIdParam: 'roleId',
  })
  @AddPermissionToRoleSwagger()
  async addPermission(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: AddPermissionDto,
  ): Promise<RolePermissionResponseDto> {
    const role = await this.roleService.addPermissionToRole(roleId, dto.permissionCode);

    return {
      roleId: role.id,
      roleName: role.name,
      roleDescription: role.description ?? '',
      permissions: role.permissions.map((p) => ({
        code: p.code,
        description: p.description ?? PermissionDescriptions[p.code as PermissionEnum] ?? '',
      })),
    };
  }

  /**
   * 역할에서 권한 제거
   * DELETE /v1/admin/role-permissions/:roleId/permissions/:permissionCode
   */
  @Delete(':roleId/permissions/:permissionCode')
  @RequirePermissions(PermissionEnum.ROLE_WRITE)
  @AuditAction({
    action: AuditActionEnum.PERMISSION_REVOKE,
    targetType: TargetType.SYSTEM,
    targetIdParam: 'roleId',
  })
  @RemovePermissionFromRoleSwagger()
  async removePermission(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Param('permissionCode') permissionCode: PermissionEnum,
  ): Promise<RolePermissionResponseDto> {
    const role = await this.roleService.removePermissionFromRole(roleId, permissionCode);

    return {
      roleId: role.id,
      roleName: role.name,
      roleDescription: role.description ?? '',
      permissions: role.permissions.map((p) => ({
        code: p.code,
        description: p.description ?? PermissionDescriptions[p.code as PermissionEnum] ?? '',
      })),
    };
  }
}
