import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoleService } from '../../../../business/role/role.service';
import { CreateRoleDto } from '../../../../domain/role/dto/create-role.dto';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../../domain/role/permission.enum';
import { UnifiedJwtAuthGuard } from '../../../../common/guards/unified-jwt-auth.guard';
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import {
  CreateRoleSwagger,
  FindAllRolesSwagger,
  FindRoleByIdSwagger,
  DeleteRoleSwagger,
  GetUserPermissionsSwagger,
} from './role.swagger';

@ApiTags('901.프로젝트 관리자 - 역할 관리')
@Controller('v1/roles')
@ApiBearerAuth()
@UseGuards(UnifiedJwtAuthGuard, PermissionsGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @CreateRoleSwagger()
  @RequirePermissions(PermissionEnum.ROLE_WRITE)
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.createRole(dto);
  }

  @Get()
  @FindAllRolesSwagger()
  @RequirePermissions(PermissionEnum.ROLE_READ)
  findAll() {
    return this.roleService.findAll();
  }

  @Get('users/:userId/permissions')
  @GetUserPermissionsSwagger()
  @RequirePermissions(PermissionEnum.ROLE_READ)
  getUserPermissions(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.roleService.getUserPermissions(userId);
  }

  @Get(':id')
  @FindRoleByIdSwagger()
  @RequirePermissions(PermissionEnum.ROLE_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleService.findById(id);
  }

  @Delete(':id')
  @DeleteRoleSwagger()
  @RequirePermissions(PermissionEnum.ROLE_WRITE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleService.delete(id);
  }
}
