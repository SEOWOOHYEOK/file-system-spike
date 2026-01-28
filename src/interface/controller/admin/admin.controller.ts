/**
 * Admin 컨트롤러
 * 스토리지 및 동기화 이벤트 문제 확인 API
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AdminService } from '../../../business/admin';
import {
  CacheHealthCheckResponseDto,
  NasHealthCheckResponseDto,
  StorageConsistencyQueryDto,
  StorageConsistencyResponseDto,
  SyncEventsQueryDto,
  SyncEventsResponseDto,
} from './dto';

@ApiTags('500.관리자')
@Controller('v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
