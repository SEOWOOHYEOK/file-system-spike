import {
    Controller,
    Get,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FavoriteService } from '../../../business/favorite/favorite.service';
import { AuditLogService } from '../../../business/audit/audit-log.service';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { RequestContext } from '../../../common/context/request-context';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GetAuditLogSwagger } from './audit.swagger'
import { RecentActivitiesQueryDto } from './dto/recent-activity.dto';
import { RecentActivitiesResponseDto } from './dto/recent-activity.dto';


@ApiTags('330.사용자 활동 내역 조회 API')
@UseGuards(JwtAuthGuard)
@Controller('v1/users/audit-log')
export class UserAuditLogController {
    constructor(
        private readonly favoriteService: FavoriteService,
        private readonly auditLogService: AuditLogService,
    ) { }


    /**
     * GET /v1/users/favorites/recent-activities - 최근 파일 활동 조회
     */
    @Get()
    @GetAuditLogSwagger()
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
