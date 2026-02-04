/**
 * Admin 컨트롤러
 * 스토리지 및 동기화 이벤트 문제 확인 API
 */
import { Controller, Get, Post, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AdminService, QueueStatusService, SyncEventStatsService } from '../../../business/admin';
import {
  CacheHealthCheckResponseDto,
  NasHealthCheckResponseDto,
  StorageConsistencyQueryDto,
  StorageConsistencyResponseDto,
  SyncEventsQueryDto,
  SyncEventsResponseDto,
  QueueStatusResponseDto,
  CacheUsageResponseDto,
  CacheEvictionResponseDto,
} from './dto';

@ApiTags('500.관리자')
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly queueStatusService: QueueStatusService,
    private readonly syncEventStatsService: SyncEventStatsService,
  ) {}

  /**
   * GET /v1/admin/cache/health-check - 캐시 스토리지 연결 상태 확인
   */
  @Get('cache/health-check')
  @ApiOperation({ summary: '캐시 스토리지 연결 상태 확인' })
  @ApiOkResponse({
    description: '캐시 스토리지 연결 상태',
    type: CacheHealthCheckResponseDto,
  })
  async checkCacheHealth(): Promise<CacheHealthCheckResponseDto> {
    return this.adminService.checkCacheHealth();
  }

  /**
   * GET /v1/admin/nas/health-check - NAS 스토리지 연결 상태 및 용량 확인
   */
  @Get('nas/health-check')
  @ApiOperation({ summary: 'NAS 스토리지 연결 상태 및 용량 확인' })
  @ApiOkResponse({
    description: 'NAS 스토리지 연결 상태와 용량 정보',
    type: NasHealthCheckResponseDto,
  })
  async checkNasHealth(): Promise<NasHealthCheckResponseDto> {
    return this.adminService.checkNasHealth();
  }

  /**
   * GET /v1/admin/storage/consistency - 스토리지 일관성 검증
   */
  @Get('storage/consistency')
  @ApiOperation({
    summary: '스토리지 일관성 검증',
    description: 'DB와 실제 스토리지 간의 일관성을 확인합니다. DB에만 있거나, 크기가 다르거나, 고아 객체를 감지합니다.',
  })
  @ApiOkResponse({
    description: '일관성 검증 결과',
    type: StorageConsistencyResponseDto,
  })
  async checkStorageConsistency(
    @Query() query: StorageConsistencyQueryDto,
  ): Promise<StorageConsistencyResponseDto> {
    return this.adminService.checkStorageConsistency({
      storageType: query.storageType,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
      sample: query.sample ?? false,
    });
  }

  /**
   * GET /v1/admin/sync/events - 동기화 이벤트 조회
   */
  @Get('sync/events')
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
  @Get('sync/events/by-file/:fileId')
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
  @Get('sync/events/by-folder/:folderId')
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
  @Get('sync/events/by-user/:userId')
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
   * GET /v1/admin/sync/dashboard - 동기화 대시보드
   */
  @Get('sync/dashboard')
  @ApiOperation({
    summary: '동기화 대시보드',
    description:
      '현재 진행 중인 동기화 작업 현황을 한눈에 볼 수 있습니다.\n\n' +
      '**상태 요약:** PENDING, QUEUED, PROCESSING, RETRYING, DONE, FAILED 각 개수\n' +
      '**사용자별 현황:** 사용자별 대기/처리 중 작업 건수\n' +
      '**진행 중 작업:** 현재 처리 중인 모든 작업 목록 (userId 포함)\n' +
      '**최근 실패:** 최근 24시간 내 실패한 작업 목록',
  })
  async getSyncDashboard() {
    return this.adminService.getSyncDashboard();
  }

  /**
   * GET /v1/admin/queue/status - Bull 큐 현황 조회
   */
  @Get('queue/status')
  @ApiOperation({
    summary: 'Bull 큐 현황 조회',
    description:
      'NAS 동기화 관련 Bull 큐의 현황을 조회합니다.\n\n' +
      '**큐 목록:**\n' +
      '- `NAS_FILE_SYNC`: 파일 동기화 (upload, rename, move, trash, restore, purge)\n' +
      '- `NAS_FOLDER_SYNC`: 폴더 동기화 (mkdir, rename, move, trash, restore, purge)\n\n' +
      '**상태 정보:**\n' +
      '- waiting: 대기 중인 작업 수\n' +
      '- active: 처리 중인 작업 수\n' +
      '- completed: 완료된 작업 수\n' +
      '- failed: 실패한 작업 수\n' +
      '- delayed: 지연된 작업 수',
  })
  @ApiOkResponse({
    description: '큐 현황 조회 결과',
    type: QueueStatusResponseDto,
  })
  async getQueueStatus(): Promise<QueueStatusResponseDto> {
    return this.queueStatusService.getQueueStatus();
  }

  /**
   * GET /v1/admin/queue/jobs - 큐 작업 목록 조회 (상태별 그룹화)
   */
  @Get('queue/jobs')
  @ApiOperation({
    summary: '큐 작업 목록 조회',
    description:
      '큐의 상태별 작업 목록을 한번에 조회합니다.\n\n' +
      '**상태별 작업:**\n' +
      '- waiting: 대기 중인 작업\n' +
      '- active: 처리 중인 작업\n' +
      '- delayed: 재시도 대기 중인 작업\n' +
      '- failed: 실패한 작업\n' +
      '- completed: 완료된 작업\n\n' +
      '**쿼리 파라미터:**\n' +
      '- queueName: 특정 큐만 조회 (미지정 시 모든 큐)\n' +
      '- limit: 각 상태별 최대 조회 수 (기본값: 20)',
  })
  @ApiQuery({ name: 'queueName', required: false, description: '큐 이름 (NAS_FILE_SYNC, NAS_FOLDER_SYNC)' })
  @ApiQuery({ name: 'limit', required: false, description: '각 상태별 최대 조회 수', example: 20 })
  async getQueueJobs(
    @Query('queueName') queueName?: string,
    @Query('limit') limit?: number,
  ) {
    const limitNum = limit ?? 20;
    if (queueName) {
      return this.queueStatusService.getQueueJobs(queueName, limitNum);
    }
    return this.queueStatusService.getAllQueueJobs(limitNum);
  }

  /**
   * GET /v1/admin/cache/usage - 캐시 사용 현황 조회
   */
  @Get('cache/usage')
  @ApiOperation({
    summary: '캐시 사용 현황 조회',
    description:
      '캐시 스토리지의 사용량, 파일 수, 임계값 설정 등을 조회합니다. ' +
      '사용률이 thresholdPercent를 초과하면 자동 Eviction이 시작됩니다.',
  })
  @ApiOkResponse({
    description: '캐시 사용 현황',
    type: CacheUsageResponseDto,
  })
  async getCacheUsage(): Promise<CacheUsageResponseDto> {
    return this.adminService.getCacheUsage();
  }

  /**
   * POST /v1/admin/cache/evict - 수동 캐시 정리
   */
  @Post('cache/evict')
  @ApiOperation({
    summary: '수동 캐시 정리',
    description:
      'LRU 정책에 따라 캐시를 수동으로 정리합니다. ' +
      '임계값과 관계없이 목표 사용률(targetPercent)까지 정리합니다. ' +
      '다운로드 중인 파일(leaseCount > 0)과 NAS 미동기화 파일은 보호됩니다.',
  })
  @ApiOkResponse({
    description: '캐시 정리 결과',
    type: CacheEvictionResponseDto,
  })
  async runCacheEviction(): Promise<CacheEvictionResponseDto> {
    return this.adminService.runCacheEviction();
  }
}
