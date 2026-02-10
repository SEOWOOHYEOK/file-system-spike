import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditLogService } from '../../../business/audit/audit-log.service';
import { AuditAction } from '../../../domain/audit/enums/audit-action.enum';
import { RequestContext } from '../../../common/context/request-context';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GetAuditLogSwagger } from './audit.swagger';
import {
  RecentActivitiesQueryDto,
  RecentActivityItemDto,
  FILE_FOLDER_ACTIONS,
} from './dto/recent-activity.dto';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';

@ApiTags('330.사용자 활동 내역 조회 API')
@UseGuards(JwtAuthGuard)
@Controller('v1/users/audit-log')
export class UserAuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * GET /v1/users/audit-log - 사용자 파일/폴더 활동 내역 조회 (페이지네이션)
   */
  @Get()
  @GetAuditLogSwagger()
  async getRecentActivities(
    @Query() query: RecentActivitiesQueryDto,
  ): Promise<PaginatedResponseDto<RecentActivityItemDto>> {
    const userId = RequestContext.getUserId() || 'unknown';

    // 액션 필터 파싱: 콤마 구분 문자열 → AuditAction 배열
    const filterActions = query.actions
      ? query.actions
          .split(',')
          .map((a) => a.trim())
          .filter((a): a is AuditAction =>
            Object.values(AuditAction).includes(a as AuditAction),
          )
      : undefined;

    // Service에 위임 (DB 레벨 필터링 + 페이지네이션)
    const result = await this.auditLogService.findUserFileActivities(
      userId,
      FILE_FOLDER_ACTIONS,
      filterActions,
      { page: query.page, pageSize: query.pageSize },
    );

    // 도메인 → 응답 DTO 매핑
    return PaginatedResponseDto.from(result, (log) => ({
      action: log.action,
      actionCategory: log.actionCategory,
      targetType: log.targetType,
      targetId: log.targetId,
      targetName: log.targetName || '',
      targetPath: log.targetPath,
      result: log.result,
      createdAt: log.createdAt,
    }));
  }
}
