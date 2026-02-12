import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UnifiedJwtAuthGuard } from '../../../common/guards/unified-jwt-auth.guard';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { UserService } from '../../../business/user/user.service';
import { User } from '../../../common/decorators/user.decorator';
import { MyPermissionResponseDto } from './dto/my-permission-response.dto';
import { ApiGetMyPermissions } from './my-permission.swagger';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';

/**
 * 600. 나의 권한 조회
 *
 * 현재 로그인한 사용자의 역할 및 보유 권한을 조회합니다.
 * 프론트엔드에서 UI 분기 (버튼 노출, 안내 메시지 등)에 활용합니다.
 */
@ApiTags('600.나의 권한 조회')
@Controller('v1/users/me')
@ApiBearerAuth()
@UseGuards(UnifiedJwtAuthGuard, PermissionsGuard)
export class MyPermissionController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /v1/users/me/permissions - 나의 역할 및 권한 조회
   */
  @Get('permissions')
  @ApiGetMyPermissions()
  async getMyPermissions(
    @User() user: { id: string },
  ): Promise<MyPermissionResponseDto> {
    const { role } = await this.userService.findByIdWithRole(user.id);

    if (!role) {
      throw BusinessException.of(ErrorCodes.SHARE_NO_ROLE, {
        requesterId: user.id,
      });
    }

    return MyPermissionResponseDto.fromRole(role);
  }
}
