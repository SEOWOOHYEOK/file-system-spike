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
  RecentActivitiesQueryDto,
  RecentActivitiesResponseDto,
} from './dto/recent-activity.dto';
import {
  AddFavoriteSwagger,
  RemoveFavoriteSwagger,
  GetFavoritesSwagger,
  GetRecentActivitiesSwagger,
} from './userFavorite.swagger';
import { RequestContext } from '../../../common/context/request-context';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('310.사용자 즐겨 찾기')
@UseGuards(JwtAuthGuard)
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

  // ========== 최근 활동 API ==========

  /**
   * GET /v1/users/favorites/recent-activities - 최근 파일 활동 조회
   */
  @Get('recent-activities')
  @GetRecentActivitiesSwagger()
  async getRecentActivities(
    @Req() req: any,
    @Query() query: RecentActivitiesQueryDto,
  ): Promise<RecentActivitiesResponseDto> {
    const userId = RequestContext.getUserId() || 'unknown';
    const limit = query.limit || 20;

    // 액션 필터 파싱
    let actions: AuditActionEnum[] | undefined;
    if (query.actions) {
      actions = query.actions
        .split(',')
        .map((a) => a.trim())
        .filter((a) => Object.values(AuditActionEnum).includes(a as AuditActionEnum))
        .map((a) => a as AuditActionEnum);
    }

    // AuditLogService를 통해 사용자별 최근 로그 조회
    const logs = await this.auditLogService.findByUserId(userId, limit);

    // 액션 필터 적용
    const filtered = actions
      ? logs.filter((log) => actions!.includes(log.action))
      : logs;

    return {
      userId,
      activities: filtered.map((log) => ({
        action: log.action,
        actionCategory: log.actionCategory,
        targetType: log.targetType,
        targetId: log.targetId,
        targetName: log.targetName || '',
        targetPath: log.targetPath,
        result: log.result,
        createdAt: log.createdAt,
      })),
      total: filtered.length,
    };
  }
}
