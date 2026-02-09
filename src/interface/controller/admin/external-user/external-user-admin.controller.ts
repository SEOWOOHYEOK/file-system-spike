import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards';
import { ExternalUserManagementService } from '../../../../business/external-share/external-user-management.service';
import { User } from '../../../../common/decorators/user.decorator';
import {
  ApiCreateExternalUser,
  ApiGetExternalUsers,
  ApiGetExternalUserById,
  ApiUpdateExternalUser,
  ApiDeactivateUser,
  ApiActivateUser,
  ApiResetPassword,
} from './external-user-admin.swagger';
import { CreateExternalUserRequestDto } from './dto/create-external-user.dto';
import { UpdateExternalUserRequestDto } from './dto/update-external-user.dto';

import { PaginationQueryDto } from '../../../common/dto';
import { ExternalUserListItemDto } from './dto/external-user-response.dto';
import { AuditAction } from '../../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';

/**
 * 외부 사용자 관리 컨트롤러 (관리자용)
 */
@ApiTags('520.관리자-외부사용자')
@Controller('v1/admin/external-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiExtraModels(ExternalUserListItemDto)
export class ExternalUserAdminController {
  constructor(
    private readonly userService: ExternalUserManagementService,
  ) { }

  /**
   * 외부 사용자 생성
   */
  @Post()
  @ApiCreateExternalUser()
  @AuditAction({
    action: AuditActionEnum.EXTERNAL_USER_CREATE,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  async createExternalUser(
    @User() user: { id: string },
    @Body() dto: CreateExternalUserRequestDto,
  ) {
    return this.userService.createExternalUser(user.id, dto);
  }


  /**
   * 외부 사용자 목록 조회
   */
  @Get()
  @ApiGetExternalUsers()
  async getExternalUsers(@Query() query: PaginationQueryDto) {
    return this.userService.getExternalUsers(query);
  }

  /**
   * 외부 사용자 상세 조회
   */
  @Get(':id')
  @ApiGetExternalUserById()
  async getExternalUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getExternalUserById(id);
  }

  /**
   * 외부 사용자 정보 수정
   */
  @Patch(':id')
  @ApiUpdateExternalUser()
  @AuditAction({
    action: AuditActionEnum.EXTERNAL_USER_UPDATE,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  async updateExternalUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExternalUserRequestDto,
  ) {
    return this.userService.updateExternalUser(id, dto);
  }

  /**
   * 계정 비활성화
   */
  @Patch(':id/deactivate')
  @ApiDeactivateUser()
  @AuditAction({
    action: AuditActionEnum.EXTERNAL_USER_DEACTIVATE,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  async deactivateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.deactivateUser(id);
  }

  /**
   * 계정 활성화
   */
  @Patch(':id/activate')
  @ApiActivateUser()
  @AuditAction({
    action: AuditActionEnum.EXTERNAL_USER_ACTIVATE,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  async activateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.activateUser(id);
  }

  /**
   * 비밀번호 초기화
   */
  @Post(':id/reset-password')
  @ApiResetPassword()
  @AuditAction({
    action: AuditActionEnum.EXTERNAL_USER_PASSWORD_RESET,
    targetType: TargetType.USER,
    targetIdParam: 'id',
  })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.resetPassword(id);
  }
}
