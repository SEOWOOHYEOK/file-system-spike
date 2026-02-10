/**
 * Admin 비즈니스 서비스
 * Admin API의 비즈니스 로직을 조율합니다.
 */
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CacheHealthCheckService, CacheHealthResult } from '../../infra/storage/cache/cache-health-check.service';
import { NasHealthCheckService, NasHealthResult } from '../../infra/storage/nas/nas-health-check.service';
import {
  StorageConsistencyService,
  StorageConsistencyResult,
  ConsistencyCheckParams,
} from './storage-consistency.service';
import {
  SyncEventStatsService,
  FindSyncEventsParams,
} from './sync-event-stats.service';
import { CacheManagementService } from './cache-management.service';
import {
  SyncEventsResponseDto,
  CacheUsageResponseDto,
  CacheEvictionResponseDto,
  SyncDashboardSummaryResponseDto,
  SyncDashboardEventsQueryDto,
  SyncDashboardEventItemDto,
} from '../../interface/controller/admin/dto';
import { PaginatedResponseDto } from '../../interface/common/dto/pagination.dto';
import { FILE_REPOSITORY, type IFileRepository } from '../../domain/file/repositories/file.repository.interface';
import type { SyncEventFilterParams } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import { SyncEventEntity } from '../../domain/sync-event/entities/sync-event.entity';
import { Employee } from '../../integrations/migration/organization/entities/employee.entity';
import { EmployeeDepartmentPosition } from '../../integrations/migration/organization/entities/employee-department-position.entity';

const STUCK_PENDING_HOURS = 1;
const STUCK_PROCESSING_MS = 30 * 60 * 1000;

@Injectable()
export class AdminService {
  constructor(
    private readonly cacheHealthCheckService: CacheHealthCheckService,
    private readonly nasHealthCheckService: NasHealthCheckService,
    private readonly storageConsistencyService: StorageConsistencyService,
    private readonly syncEventStatsService: SyncEventStatsService,
    private readonly cacheManagementService: CacheManagementService,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDepartmentPosition)
    private readonly edpRepository: Repository<EmployeeDepartmentPosition>,
  ) {}

  /**
   * 캐시 스토리지 연결 상태 확인
   * @returns Cache Health Check 결과
   */
  async checkCacheHealth(): Promise<CacheHealthResult> {
    return this.cacheHealthCheckService.checkHealth();
  }

  /**
   * NAS 스토리지 연결 상태 및 용량 확인
   * @returns NAS Health Check 결과 (용량 정보 포함)
   */
  async checkNasHealth(): Promise<NasHealthResult> {
    return this.nasHealthCheckService.checkHealth();
  }

  /**
   * 스토리지 일관성 검증
   * DB와 실제 스토리지 간의 일관성을 확인합니다.
   * @param params 검증 파라미터
   * @returns 일관성 검증 결과
   */
  async checkStorageConsistency(params: ConsistencyCheckParams): Promise<StorageConsistencyResult> {
    return this.storageConsistencyService.checkConsistency(params);
  }

  /**
   * 동기화 이벤트 조회
   * 전체 또는 조건에 맞는 동기화 이벤트를 조회합니다.
   * @param params 조회 파라미터
   * @returns 동기화 이벤트 조회 결과
   */
  async getSyncEvents(params: FindSyncEventsParams): Promise<SyncEventsResponseDto> {
    const result = await this.syncEventStatsService.findSyncEvents(params);

    // 페이징 정보의 hasMore 계산
    const hasMore = params.offset + params.limit < result.summary.total;

    return {
      summary: result.summary,
      events: result.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        targetType: event.targetType,
        fileId: event.fileId,
        folderId: event.folderId,
        sourcePath: event.sourcePath,
        targetPath: event.targetPath,
        status: event.status,
        retryCount: event.retryCount,
        maxRetries: event.maxRetries,
        errorMessage: event.errorMessage,
        metadata: event.metadata,
        processedAt: event.processedAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        isStuck: event.isStuck,
        ageHours: event.ageHours,
        userId: event.processBy,
      })),
      pagination: {
        limit: params.limit,
        offset: params.offset,
        hasMore,
      },
      checkedAt: new Date(),
    };
  }

  /**
   * 캐시 사용 현황 조회
   * DB 통계 + 디스크 실제 통계 + 미동기화 현황 포함
   * @returns 캐시 사용 현황
   */
  async getCacheUsage(): Promise<CacheUsageResponseDto> {
    const status = await this.cacheManagementService.getCacheStatus();

    return {
      currentBytes: status.currentBytes,
      maxBytes: status.maxBytes,
      usagePercent: Math.round(status.usagePercent * 100) / 100,
      thresholdPercent: status.thresholdPercent,
      targetPercent: status.targetPercent,
      currentBytesFormatted: this.formatBytes(status.currentBytes),
      maxBytesFormatted: this.formatBytes(status.maxBytes),
      db: {
        totalCount: status.db.totalCount,
        byStatus: status.db.byStatus,
        leasedCount: status.db.leasedCount,
        unsyncedToNasCount: status.db.unsyncedToNasCount,
        evictableCount: status.db.evictableCount,
      },
      disk: {
        fileCount: status.disk.fileCount,
        totalBytes: status.disk.totalBytes,
        totalBytesFormatted: this.formatBytes(status.disk.totalBytes),
      },
      checkedAt: new Date(),
    };
  }

  /**
   * 수동 캐시 Eviction 실행
   * @returns Eviction 결과
   */
  async runCacheEviction(): Promise<CacheEvictionResponseDto> {
    const result = await this.cacheManagementService.runEviction();

    return {
      evictedCount: result.evictedCount,
      freedBytes: result.freedBytes,
      freedBytesFormatted: this.formatBytes(result.freedBytes),
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      executedAt: new Date(),
    };
  }

  /**
   * 동기화 대시보드 요약 조회
   * 전체 상태별 카운트와 stuck 수를 반환합니다.
   */
  async getSyncDashboardSummary(): Promise<SyncDashboardSummaryResponseDto> {
    const [statusCounts, stuckCount] = await Promise.all([
      this.syncEventStatsService.countByStatus(),
      this.syncEventStatsService.getStuckCount(),
    ]);
    const now = new Date();
    return SyncDashboardSummaryResponseDto.from(statusCounts, stuckCount, now);
  }

  /**
   * 동기화 대시보드 이벤트 목록 조회 (필터 + 페이지네이션)
   */
  async getSyncDashboardEvents(
    params: SyncDashboardEventsQueryDto,
  ): Promise<PaginatedResponseDto<SyncDashboardEventItemDto>> {
    const filterParams = this.buildSyncEventFilterParams(params);
    const { events, total } = await this.syncEventStatsService.findDashboardEvents(filterParams);

    const fileIds = [...new Set(events.map((e) => e.fileId).filter((id): id is string => !!id))];
    const userIds = [...new Set(events.map((e) => e.processBy).filter(Boolean))];

    const [files, employees, edps] = await Promise.all([
      fileIds.length > 0 ? this.fileRepository.findByIds(fileIds) : Promise.resolve([]),
      userIds.length > 0
        ? this.employeeRepository.find({ where: { id: In(userIds) } })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.edpRepository.find({
            where: { employeeId: In(userIds) },
            relations: ['department'],
          })
        : Promise.resolve([]),
    ]);

    const fileMap = new Map(files.map((f) => [f.id, f]));
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    const deptMap = new Map<string, string>();
    for (const edp of edps) {
      if (!deptMap.has(edp.employeeId) && edp.department) {
        deptMap.set(edp.employeeId, edp.department.departmentName);
      }
    }

    const now = new Date();
    const items = events.map((event) => {
      const file = event.fileId ? fileMap.get(event.fileId) : null;
      const emp = event.processBy ? employeeMap.get(event.processBy) : null;
      const employee = emp
        ? { id: emp.id, name: emp.name, departmentName: deptMap.get(emp.id) ?? null }
        : null;
      const isStuck = this.isStuckEvent(event, now);
      return SyncDashboardEventItemDto.from(event, file ?? null, employee, isStuck);
    });

    return PaginatedResponseDto.of(
      items,
      params.page,
      params.pageSize,
      total,
    );
  }

  private buildSyncEventFilterParams(
    params: SyncDashboardEventsQueryDto,
  ): SyncEventFilterParams {
    const fromDate = params.fromDate
      ? new Date(params.fromDate + 'T00:00:00.000Z')
      : undefined;
    const toDate = params.toDate
      ? new Date(params.toDate + 'T23:59:59.999Z')
      : undefined;
    return {
      status: params.status,
      eventType: params.eventType,
      targetType: params.targetType,
      userId: params.userId,
      fromDate,
      toDate,
      page: params.page,
      pageSize: params.pageSize,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    };
  }

  private isStuckEvent(event: SyncEventEntity, now: Date): boolean {
    if (event.status === 'PENDING') {
      const ageHours = (now.getTime() - event.createdAt.getTime()) / (1000 * 60 * 60);
      return ageHours >= STUCK_PENDING_HOURS;
    }
    if (event.status === 'PROCESSING') {
      const ageMs = now.getTime() - event.createdAt.getTime();
      return ageMs >= STUCK_PROCESSING_MS;
    }
    return false;
  }

  /**
   * 바이트를 읽기 쉬운 형식으로 변환
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }
}
