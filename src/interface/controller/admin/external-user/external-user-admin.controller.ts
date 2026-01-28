import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  ExternalUserManagementService,
  type CreateExternalUserDto,
  type UpdateExternalUserDto,
} from '../../../../business/external-share/external-user-management.service';
import { PaginationParams } from '../../../../domain/external-share/repositories/external-user.repository.interface';
import { User } from '../../../../common/decorators/user.decorator';

/**
 * 외부 사용자 관리 컨트롤러 (관리자용)
 */
@ApiTags('ExternalUsersAdmin')
@Controller('v1/admin/external-users')
@ApiBearerAuth()
export class ExternalUserAdminController {
  constructor(
    private readonly userService: ExternalUserManagementService,
  ) {}

  /**
   * 외부 사용자 생성
   */
  @Post()
  @ApiOperation({ summary: '외부 사용자 생성' })
  async createExternalUser(
    @User() user: { id: string },
    @Body() dto: CreateExternalUserDto,
  ) {
    return this.userService.createExternalUser(user.id, dto);
  }

  /**
   * 외부 사용자 목록 조회
   */
  @Get()
  @ApiOperation({ summary: '외부 사용자 목록 조회' })
  async getExternalUsers(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const pagination: PaginationParams = { page, pageSize, sortBy, sortOrder };
    return this.userService.getExternalUsers(pagination);
  }

  /**
   * 외부 사용자 상세 조회
   */
  @Get(':id')
  @ApiOperation({ summary: '외부 사용자 상세 조회' })
  async getExternalUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getExternalUserById(id);
  }

  /**
   * 외부 사용자 정보 수정
   */
  @Patch(':id')
  @ApiOperation({ summary: '외부 사용자 정보 수정' })
  async updateExternalUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExternalUserDto,
  ) {
    return this.userService.updateExternalUser(id, dto);
  }

  /**
   * 계정 비활성화
   */
  @Patch(':id/deactivate')
  @ApiOperation({ summary: '외부 사용자 계정 비활성화' })
  async deactivateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.deactivateUser(id);
  }

  /**
   * 계정 활성화
   */
  @Patch(':id/activate')
  @ApiOperation({ summary: '외부 사용자 계정 활성화' })
  async activateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.activateUser(id);
  }

  /**
   * 비밀번호 초기화
   */
  @Post(':id/reset-password')
  @ApiOperation({ summary: '비밀번호 초기화' })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.resetPassword(id);
  }
}
