/**
 * 동기화 이벤트 컨트롤러
 * NAS 동기화 상태 조회 API
 */
import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  FileSyncStatusResponse,
  SyncEventQueryService,
  SyncEventStatusResponse,
} from '../../../business/sync-event';

import { ApiSyncEventStatus, ApiFileSyncStatus } from './sync-event.swagger';

/**
 * 동기화 이벤트 컨트롤러
 */
@ApiTags('250.동기화')
@Controller('v1')
export class SyncEventController {
  constructor(
    private readonly syncEventQueryService: SyncEventQueryService,
  ) {}

  /**
   * GET /sync-events/:syncEventId - 동기화 이벤트 상태 조회
   */
  @Get('sync-events/:syncEventId')
  @ApiSyncEventStatus()
  async getSyncEventStatus(
    @Param('syncEventId') syncEventId: string,
  ): Promise<SyncEventStatusResponse> {
    return this.syncEventQueryService.getSyncEventStatus(syncEventId);
  }

  /**
   * GET /files/:fileId/sync-status - 파일 동기화 상태 조회
   */
  @Get('files/:fileId/sync-status')
  @ApiFileSyncStatus()
  async getFileSyncStatus(
    @Param('fileId') fileId: string,
  ): Promise<FileSyncStatusResponse> {
    return this.syncEventQueryService.getFileSyncStatus(fileId);
  }
}
