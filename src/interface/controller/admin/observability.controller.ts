/**
 * Observability 컨트롤러
 * NAS 모니터링 대시보드 API
 *
 * 엔드포인트:
 * - GET  /v1/admin/observability/current   - NAS 현재 상태 (실시간 헬스체크)
 * - GET  /v1/admin/observability/history    - NAS 상태 이력 + 정상 비율
 * - GET  /v1/admin/observability/settings   - Observability 설정 조회
 * - PUT  /v1/admin/observability/settings   - Observability 설정 변경
 */
import { Controller, Get, Put, Query, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ObservabilityService } from '../../../business/admin/observability.service';
import {
  ObservabilityCurrentDto,
  ObservabilityHistoryQueryDto,
  ObservabilityHistoryResponseDto,
  ObservabilitySettingsResponseDto,
  UpdateObservabilitySettingsDto,
} from './dto/observability.dto';
import {
  ApiObservabilityCurrent,
  ApiObservabilityHistory,
  ApiObservabilitySettingsGet,
  ApiObservabilitySettingsUpdate,
} from './observability.swagger';

@ApiTags('500.관리자')
@Controller('v1/admin/observability')
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
  ) {}

  /**
   * GET /v1/admin/observability/current
   * 현재 NAS 상태 조회 (실시간 헬스체크)
   */
  @Get('current')
  @ApiObservabilityCurrent()
  async getCurrent(): Promise<ObservabilityCurrentDto> {
    return this.observabilityService.getCurrent();
  }

  /**
   * GET /v1/admin/observability/history?hours=24
   * NAS 상태 이력 조회
   */
  @Get('history')
  @ApiObservabilityHistory()
  async getHistory(
    @Query() query: ObservabilityHistoryQueryDto,
  ): Promise<ObservabilityHistoryResponseDto> {
    return this.observabilityService.getHistory(query.hours ?? 24);
  }

  /**
   * GET /v1/admin/observability/settings
   * Observability 설정 조회
   */
  @Get('settings')
  @ApiObservabilitySettingsGet()
  async getSettings(): Promise<ObservabilitySettingsResponseDto> {
    return this.observabilityService.getSettings();
  }

  /**
   * PUT /v1/admin/observability/settings
   * Observability 설정 변경
   */
  @Put('settings')
  @ApiObservabilitySettingsUpdate()
  async updateSettings(
    @Body() dto: UpdateObservabilitySettingsDto,
  ): Promise<ObservabilitySettingsResponseDto> {
    // TODO: 실제 구현 시 인증된 사용자 ID를 가져올 것
    return this.observabilityService.updateSettings(dto, 'admin');
  }
}
