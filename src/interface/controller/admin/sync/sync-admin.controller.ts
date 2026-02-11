/**
 * Sync Admin 컨트롤러
 * 동기화 이벤트 조회 및 대시보드 API
 */
import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../../domain/role/permission.enum';
import { AdminService, SyncEventStatsService } from '../../../../business/admin';
import {
  SyncEventsQueryDto,
  SyncEventsResponseDto,
  SyncDashboardSummaryResponseDto,
  SyncDashboardEventsQueryDto,
} from '../dto';

@ApiTags('802.관리자 -파일 및 폴더 NAS 동기화 관리')
@ApiBearerAuth()
@Controller('v1/admin/sync')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.SYNC_MANAGE)
export class SyncAdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly syncEventStatsService: SyncEventStatsService,
  ) {}

  /**
   * GET /v1/admin/sync/events - 동기화 이벤트 조회
   */
  @Get('events')
  @ApiOperation({
    summary: '동기화 이벤트 조회',
    description:
      '전체 동기화 이벤트를 조회합니다. ' +
      '문제가 있는 이벤트(stuck, failed)를 확인하려면 status 파라미터를 PENDING, PROCESSING, FAILED로 필터링하세요. ' +
      'stuck 판단 기준: PENDING 1시간 이상, PROCESSING 30분 이상.',
  })
  @ApiOkResponse({
    description: '동기화 이벤트 조회 결과',
    type: SyncEventsResponseDto,
  })
  async getSyncEvents(@Query() query: SyncEventsQueryDto): Promise<SyncEventsResponseDto> {
    return this.adminService.getSyncEvents({
      status: query.status,
      eventType: query.eventType,
      hours: query.hours ?? 24,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
    });
  }

  /**
   * GET /v1/admin/sync/events/by-file/:fileId - 파일별 동기화 이벤트 히스토리
   */
  @Get('events/by-file/:fileId')
  @ApiOperation({
    summary: '파일별 동기화 이벤트 히스토리',
    description: '특정 파일의 모든 동기화 이벤트를 조회합니다. 생성, 이름변경, 이동, 삭제 등 모든 작업 이력을 확인할 수 있습니다.',
  })
  @ApiParam({ name: 'fileId', description: '파일 ID' })
  async getSyncEventsByFile(@Param('fileId') fileId: string) {
    const events = await this.syncEventStatsService.findByFileId(fileId);
    return {
      fileId,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        status: e.status,
        retryCount: e.retryCount,
        maxRetries: e.maxRetries,
        errorMessage: e.errorMessage,
        isStuck: e.isStuck,
        ageHours: Math.round(e.ageHours * 100) / 100,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        processedAt: e.processedAt,
        userId: e.processBy,
      })),
      total: events.length,
    };
  }

  /**
   * GET /v1/admin/sync/events/by-folder/:folderId - 폴더별 동기화 이벤트 히스토리
   */
  @Get('events/by-folder/:folderId')
  @ApiOperation({
    summary: '폴더별 동기화 이벤트 히스토리',
    description: '특정 폴더의 모든 동기화 이벤트를 조회합니다. 생성, 이름변경, 이동, 삭제 등 모든 작업 이력을 확인할 수 있습니다.',
  })
  @ApiParam({ name: 'folderId', description: '폴더 ID' })
  async getSyncEventsByFolder(@Param('folderId') folderId: string) {
    const events = await this.syncEventStatsService.findByFolderId(folderId);
    return {
      folderId,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        status: e.status,
        retryCount: e.retryCount,
        maxRetries: e.maxRetries,
        errorMessage: e.errorMessage,
        isStuck: e.isStuck,
        ageHours: Math.round(e.ageHours * 100) / 100,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        processedAt: e.processedAt,
        userId: e.processBy,
      })),
      total: events.length,
    };
  }

  /**
   * GET /v1/admin/sync/events/by-user/:userId - 사용자별 동기화 이벤트 히스토리
   */
  @Get('events/by-user/:userId')
  @ApiOperation({
    summary: '사용자별 동기화 이벤트 히스토리',
    description: '특정 사용자가 발생시킨 모든 동기화 이벤트를 조회합니다.',
  })
  @ApiParam({ name: 'userId', description: '사용자 ID' })
  @ApiQuery({ name: 'status', required: false, description: '상태 필터 (PENDING, QUEUED, PROCESSING, RETRYING, DONE, FAILED)' })
  async getSyncEventsByUser(
    @Param('userId') userId: string,
    @Query('status') status?: string,
  ) {
    const result = await this.syncEventStatsService.findSyncEvents({
      hours: 24,
      limit: 1000,
      offset: 0,
    });

    // userId로 필터링
    let filteredEvents = result.events.filter((e) => e.processBy === userId);

    // 상태 필터 적용
    if (status) {
      filteredEvents = filteredEvents.filter((e) => e.status === status);
    }

    // 상태별 요약
    const summary = {
      total: filteredEvents.length,
      pending: filteredEvents.filter((e) => e.status === 'PENDING').length,
      queued: filteredEvents.filter((e) => e.status === 'QUEUED').length,
      processing: filteredEvents.filter((e) => e.status === 'PROCESSING').length,
      retrying: filteredEvents.filter((e) => e.status === 'RETRYING').length,
      done: filteredEvents.filter((e) => e.status === 'DONE').length,
      failed: filteredEvents.filter((e) => e.status === 'FAILED').length,
      stuck: filteredEvents.filter((e) => e.isStuck).length,
    };

    return {
      userId,
      summary,
      events: filteredEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        targetType: e.targetType,
        fileId: e.fileId,
        folderId: e.folderId,
        status: e.status,
        retryCount: e.retryCount,
        maxRetries: e.maxRetries,
        errorMessage: e.errorMessage,
        isStuck: e.isStuck,
        ageHours: Math.round(e.ageHours * 100) / 100,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        processedAt: e.processedAt,
      })),
    };
  }

  /**
   * GET /v1/admin/sync/dashboard/summary - 동기화 대시보드 요약
   */
  @Get('dashboard/summary')
  @ApiOperation({
    summary: '동기화 대시보드 요약',
    description:
      '전체 동기화 이벤트 상태별 카운트와 stuck 수를 반환합니다.\n\n' +
      '**상태별 카운트:** PENDING, QUEUED, PROCESSING, RETRYING, DONE, FAILED\n' +
      '**stuck 수:** PENDING 1시간 이상 + PROCESSING 30분 이상',
  })
  @ApiOkResponse({
    description: '동기화 대시보드 요약',
    type: SyncDashboardSummaryResponseDto,
  })
  async getSyncDashboardSummary(): Promise<SyncDashboardSummaryResponseDto> {
    return this.adminService.getSyncDashboardSummary();
  }

  /**
   * GET /v1/admin/sync/dashboard/events - 동기화 대시보드 이벤트 목록
   */
  @Get('dashboard/events')
  @ApiOperation({
    summary: '동기화 대시보드 이벤트 목록',
    description:
      '필터와 페이지네이션으로 동기화 이벤트 목록을 조회합니다.\n\n' +
      '**지원 필터:** status, eventType, targetType, userId, fromDate, toDate\n' +
      '**stuck 판단:** PENDING 1시간 이상, PROCESSING 30분 이상',
  })
  @ApiOkResponse({
    description: '동기화 대시보드 이벤트 목록 (페이지네이션)',
  })
  async getSyncDashboardEvents(@Query() query: SyncDashboardEventsQueryDto) {
    return this.adminService.getSyncDashboardEvents(query);
  }
}
