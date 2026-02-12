import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FavoriteService } from '../../../business/favorite/favorite.service';
import { AuditLogService } from '../../../business/audit/audit-log.service';
import { FavoriteTargetType } from '../../../domain/favorite/entities/favorite.entity';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { AuditAction } from '../../../common/decorators';
import {
  AddFavoriteRequestDto,
  GetFavoritesQueryDto,
  FavoriteResponseDto,
  FavoriteTargetTypeDto,
} from './dto/favorite.dto';
import {
  AddFavoriteSwagger,
  RemoveFavoriteSwagger,
  GetFavoritesSwagger
} from './userFavorite.swagger';
import { RequestContext } from '../../../common/context/request-context';
import { UnifiedJwtAuthGuard } from '../../../common/guards/unified-jwt-auth.guard';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';

@ApiTags('310.사용자 즐겨 찾기')
@UseGuards(UnifiedJwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FOLDER_READ)
@Controller('v1/users/favorites')
export class UserFavoriteController {
  constructor(
    private readonly favoriteService: FavoriteService,
    private readonly auditLogService: AuditLogService,
  ) { }


  // ========== 즐겨찾기 API ==========

  /**
   * POST /v1/users/favorites - 즐겨찾기 등록
   */
  @Post()
  @AddFavoriteSwagger()
  @AuditAction({
    action: AuditActionEnum.FAVORITE_ADD,
    targetType: TargetType.FAVORITE,
    targetIdParam: 'targetId',
  })
  async addFavorite(
    @Req() req: any,
    @Body() body: AddFavoriteRequestDto,
  ): Promise<FavoriteResponseDto> {
    const userId = RequestContext.getUserId() || 'unknown';
    const favorite = await this.favoriteService.addFavorite(
      userId,
      body.targetType as unknown as FavoriteTargetType,
      body.targetId,
    );

    return {
      id: favorite.id,
      targetType: favorite.targetType,
      targetId: favorite.targetId,
      createdAt: favorite.createdAt,
    };
  }

  /**
   * DELETE /v1/users/favorites/:targetType/:targetId - 즐겨찾기 해제
   */
  @Delete(':targetType/:targetId')
  @RemoveFavoriteSwagger()
  @AuditAction({
    action: AuditActionEnum.FAVORITE_REMOVE,
    targetType: TargetType.FAVORITE,
    targetIdParam: 'targetId',
  })
  async removeFavorite(
    @Req() req: any,
    @Param('targetType') targetType: FavoriteTargetTypeDto,
    @Param('targetId') targetId: string,
  ): Promise<{ message: string }> {
    const userId = RequestContext.getUserId() || 'unknown';
    await this.favoriteService.removeFavorite(
      userId,
      targetType as unknown as FavoriteTargetType,
      targetId,
    );
    return { message: '즐겨찾기가 해제되었습니다.' };
  }

  /**
   * GET /v1/users/favorites - 즐겨찾기 목록 조회
   */
  @Get()
  @GetFavoritesSwagger()
  async getFavorites(
    @Req() req: any,
    @Query() query: GetFavoritesQueryDto,
  ): Promise<FavoriteResponseDto[]> {
    const userId = RequestContext.getUserId() || 'unknown';
    const targetType = query.type as unknown as FavoriteTargetType | undefined;
    const favorites = await this.favoriteService.getFavorites(userId, targetType);

    return favorites.map((f) => ({
      id: f.id,
      targetType: f.targetType,
      targetId: f.targetId,
      createdAt: f.createdAt,
    }));
  }

}
