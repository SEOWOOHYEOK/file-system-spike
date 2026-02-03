/**
 * Admin 컨트롤러
 * 스토리지 및 동기화 이벤트 문제 확인 API
 */
import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AdminService, QueueStatusService } from '../../../business/admin';
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
