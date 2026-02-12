import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UnifiedJwtAuthGuard } from '../../../../common/guards';
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../../domain/role/permission.enum';
import { UnifiedTimelineService } from '../../../../business/audit/unified-timeline.service';
import {
  TimelineTimeRangeQueryDto,
  TimelineFileQueryDto,
  TimelineActorQueryDto,
  ObservabilityEventResponseDto,
  UnifiedTimelineResponseDto,
} from './dto';

/**
 * 통합 타임라인 관리 컨트롤러 (관리자용)
 */
@ApiTags('806.관리자 - audit log 확인')
@Controller('v1/admin/timeline')
@ApiBearerAuth()
@UseGuards(UnifiedJwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.AUDIT_READ)
export class TimelineAdminController {
  constructor(
    private readonly unifiedTimelineService: UnifiedTimelineService,
  ) {}

  /**
   * 시간 범위 통합 타임라인 조회
   * GET /v1/admin/timeline?from=...&to=...&page=1&size=20
   */
  @Get()
  @ApiOperation({
    summary: '시간 범위 통합 타임라인 조회',
    description: `
지정된 시간 범위 내의 모든 이벤트를 통합 타임라인으로 조회합니다.

### 필터 옵션
- eventSources: 이벤트 소스 필터 (AUDIT, FILE_CHANGE, SYSTEM)
- severity: 심각도 필터
- result: 결과 필터 (SUCCESS, FAILURE)
- errorCode: 에러 코드 필터

### 반환 정보
- events: 이벤트 목록 (시간순 내림차순)
- summary: 요약 정보 (소스별, 결과별, 심각도별 통계)
- page: 페이지네이션 정보
    `,
  })
  @ApiResponse({
    status: 200,
    description: '타임라인 조회 성공',
    type: UnifiedTimelineResponseDto,
  })
  @ApiResponse({ status: 400, description: '잘못된 요청 파라미터' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async getTimelineByTimeRange(
    @Query() query: TimelineTimeRangeQueryDto,
  ): Promise<UnifiedTimelineResponseDto> {
    const result = await this.unifiedTimelineService.getByTimeRange({
      from: new Date(query.from),
      to: new Date(query.to),
      eventSources: query.eventSources,
      severity: query.severity,
      result: query.result,
      errorCode: query.errorCode,
      page: query.page ?? 1,
      size: query.size ?? 20,
    });

    return UnifiedTimelineResponseDto.fromTimeline(result);
  }

  /**
   * 파일 중심 타임라인 조회
   * GET /v1/admin/timeline/files/:fileId
   */
  @Get('files/:fileId')
  @ApiOperation({
    summary: '파일 중심 타임라인 조회',
    description: `
특정 파일과 관련된 모든 이벤트를 조회합니다.

### 조회 범위
- AuditLog: 파일 관련 액션
- FileHistory: 파일 변경 이력
- SystemEvent: 파일 관련 시스템 이벤트

### 옵션
- from, to: 시간 범위 필터 (선택)
- page, size: 페이지네이션
    `,
  })
  @ApiParam({
    name: 'fileId',
    description: '파일 ID',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: '파일 타임라인 조회 성공',
    type: UnifiedTimelineResponseDto,
  })
  @ApiResponse({ status: 400, description: '잘못된 요청 파라미터' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async getTimelineByFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query() query: TimelineFileQueryDto,
  ): Promise<UnifiedTimelineResponseDto> {
    const result = await this.unifiedTimelineService.getByFileId({
      fileId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ?? 1,
      size: query.size ?? 20,
    });

    return UnifiedTimelineResponseDto.fromTimeline(result);
  }

  /**
   * 사용자 중심 타임라인 조회
   * GET /v1/admin/timeline/actors/:actorId
   */
  @Get('actors/:actorId')
  @ApiOperation({
    summary: '사용자 중심 타임라인 조회',
    description: `
특정 사용자가 수행한 모든 행위를 조회합니다.

### 조회 범위
- AuditLog: 사용자의 감사 로그
- FileHistory: 사용자가 변경한 파일 이력
- SystemEvent: 사용자가 'SYSTEM'인 경우 시스템 이벤트

### 옵션
- from, to: 시간 범위 필터 (선택)
- page, size: 페이지네이션
    `,
  })
  @ApiParam({
    name: 'actorId',
    description: '행위자 ID (사용자 ID 또는 "SYSTEM")',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: '사용자 타임라인 조회 성공',
    type: UnifiedTimelineResponseDto,
  })
  @ApiResponse({ status: 400, description: '잘못된 요청 파라미터' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async getTimelineByActor(
    @Param('actorId') actorId: string,
    @Query() query: TimelineActorQueryDto,
  ): Promise<UnifiedTimelineResponseDto> {
    const result = await this.unifiedTimelineService.getByActorId({
      actorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ?? 1,
      size: query.size ?? 20,
    });

    return UnifiedTimelineResponseDto.fromTimeline(result);
  }

  /**
   * HTTP 요청 추적
   * GET /v1/admin/timeline/requests/:requestId
   */
  @Get('requests/:requestId')
  @ApiOperation({
    summary: 'HTTP 요청 추적',
    description: `
특정 HTTP 요청이 일으킨 모든 변화를 추적합니다.

### 조회 범위
- AuditLog: 해당 requestId의 감사 로그
- FileHistory: 해당 requestId의 파일 변경 이력

### 반환 정보
요청과 관련된 모든 이벤트를 시간순으로 정렬하여 반환합니다.
    `,
  })
  @ApiParam({
    name: 'requestId',
    description: '요청 ID (trace_id 또는 request_id)',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: '요청 추적 성공',
    type: UnifiedTimelineResponseDto,
  })
  @ApiResponse({ status: 400, description: '잘못된 요청 파라미터' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async getTimelineByRequest(
    @Param('requestId') requestId: string,
  ): Promise<UnifiedTimelineResponseDto> {
    const result = await this.unifiedTimelineService.getByRequestId(requestId);
    return UnifiedTimelineResponseDto.fromTimeline(result);
  }

  /**
   * 트레이스 추적
   * GET /v1/admin/timeline/traces/:traceId
   */
  @Get('traces/:traceId')
  @ApiOperation({
    summary: '트레이스 추적',
    description: `
특정 작업의 전체 과정을 추적합니다.

### 조회 범위
- AuditLog: 해당 traceId의 감사 로그
- FileHistory: 해당 traceId의 파일 변경 이력
- SystemEvent: 해당 traceId의 시스템 이벤트

### 반환 정보
트레이스와 관련된 모든 이벤트를 시간순으로 정렬하여 반환합니다.
    `,
  })
  @ApiParam({
    name: 'traceId',
    description: '트레이스 ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: '트레이스 추적 성공',
    type: UnifiedTimelineResponseDto,
  })
  @ApiResponse({ status: 400, description: '잘못된 요청 파라미터' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async getTimelineByTrace(
    @Param('traceId') traceId: string,
  ): Promise<UnifiedTimelineResponseDto> {
    const result = await this.unifiedTimelineService.getByTraceId(traceId);
    return UnifiedTimelineResponseDto.fromTimeline(result);
  }

  /**
   * 이벤트 인과관계 체인
   * GET /v1/admin/timeline/events/:eventId/chain
   */
  @Get('events/:eventId/chain')
  @ApiOperation({
    summary: '이벤트 인과관계 체인 조회',
    description: `
특정 이벤트의 부모 이벤트 체인을 추적하여 인과관계를 조회합니다.

### 추적 방식
parentEventId를 따라 최대 10단계까지 역방향으로 추적합니다.

### 반환 정보
부모 이벤트부터 현재 이벤트까지의 체인을 시간순으로 반환합니다.
    `,
  })
  @ApiParam({
    name: 'eventId',
    description: '이벤트 ID',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: '이벤트 체인 조회 성공',
    type: [ObservabilityEventResponseDto],
  })
  @ApiResponse({ status: 400, description: '잘못된 요청 파라미터' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  @ApiResponse({ status: 404, description: '이벤트를 찾을 수 없음' })
  async getEventChain(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<ObservabilityEventResponseDto[]> {
    const chain = await this.unifiedTimelineService.getEventChain(eventId);
    return chain.map((event) => {
      const eventDto = new ObservabilityEventResponseDto();
      Object.assign(eventDto, event);
      return eventDto;
    });
  }
}
