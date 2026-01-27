import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserService } from '../../../business/user/user.service';
import { UserSyncService, SyncResult } from '../../../business/user/user-sync.service';
import { User } from '../../../domain/user/entities/user.entity';
import { AssignRoleDto } from '../../../domain/user/dto/assign-role.dto';

/**
 * User 응답 타입
 */
interface UserWithRoleResponse {
  id: string;
  isActive: boolean;
  role: {
    id: string;
    name: string;
    permissions: string[];
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User API 컨트롤러
 *
 * User CRUD 및 Role 부여/제거 API 제공
 */
@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userSyncService: UserSyncService,
  ) {}

  /**
   * 전체 User 목록 조회
   * GET /users
   */
  @Get()
  @ApiOperation({ summary: '전체 User 목록 조회' })
  @ApiResponse({ status: 200, description: 'User 목록 반환' })
  async findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  /**
   * 특정 User 조회 (Role 포함)
   * GET /users/:id
   */
  @Get(':id')
  @ApiOperation({ summary: '특정 User 조회 (Role 포함)' })
  @ApiResponse({ status: 200, description: 'User 정보 반환' })
  @ApiResponse({ status: 404, description: 'User를 찾을 수 없음' })
  async findById(@Param('id') id: string): Promise<UserWithRoleResponse> {
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
   * PATCH /users/:id/role
   */
  @Patch(':id/role')
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
   * DELETE /users/:id/role
   */
  @Delete(':id/role')
  @ApiOperation({ summary: 'User의 Role 제거' })
  @ApiResponse({ status: 200, description: 'Role 제거 완료' })
  @ApiResponse({ status: 404, description: 'User를 찾을 수 없음' })
  async removeRole(@Param('id') id: string): Promise<User> {
    return this.userService.removeRole(id);
  }

  /**
   * Employee → User 동기화
   * POST /users/sync
   *
   * Admin 권한 필요 (Guard에서 검사)
   */
  @Post('sync')
  @ApiOperation({ summary: 'Employee → User 동기화 실행' })
  @ApiResponse({ status: 200, description: '동기화 결과 반환' })
  async syncUsers(): Promise<SyncResult> {
    return this.userSyncService.syncEmployeesToUsers();
  }
}
