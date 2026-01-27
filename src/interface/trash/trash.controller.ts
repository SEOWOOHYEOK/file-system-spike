import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrashService } from '../../business/trash';
import {
  TrashListQuery,
  RestorePreviewRequest,
  RestoreExecuteRequest,
  TrashListResponse,
  RestorePreviewResponse,
  RestoreExecuteResponse,
  RestoreStatusResponse,
  PurgeResponse,
  EmptyTrashResponse,
} from '../../domain/trash';

/**
 * 휴지통 컨트롤러
 * 휴지통 조회, 복원, 영구삭제 API
 * 설계 문서: 060-1.휴지통_처리_FLOW.md
 */
@ApiTags('Trash')
@Controller('v1/trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) { }

  /**
   * GET /trash - 휴지통 목록 조회
   */
  @Get()
  @ApiOperation({ summary: '휴지통 목록 조회' })
  async getTrashList(@Query() query: TrashListQuery): Promise<TrashListResponse> {
    return this.trashService.getTrashList(query);
  }

  /**
   * POST /trash/restore/preview - 복원 미리보기 (경로 상태 확인)
   */
  @Post('restore/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '복원 미리보기' })
  async previewRestore(@Body() request: RestorePreviewRequest): Promise<RestorePreviewResponse> {
    return this.trashService.previewRestore(request);
  }

  /**
   * POST /trash/restore/execute - 복원 실행
   */
  @Post('restore/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '복원 실행' })
  async executeRestore(@Body() request: RestoreExecuteRequest): Promise<RestoreExecuteResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.executeRestore(request, userId);
  }

  /**
   * GET /trash/restore/status - 복원 상태 조회
   */
  @Get('restore/status')
  @ApiOperation({ summary: '복원 상태 조회' })
  async getRestoreStatus(@Query('syncEventIds') syncEventIds: string[] | string): Promise<RestoreStatusResponse> {
    const ids = Array.isArray(syncEventIds) ? syncEventIds : (syncEventIds ? syncEventIds.split(',') : []);
    return this.trashService.getRestoreStatus(ids);
  }

  /**
   * DELETE /trash/files/:trashMetadataId - 파일 영구삭제
   */
  @Delete('files/:trashMetadataId')
  @ApiOperation({ summary: '파일 영구삭제' })
  async purgeFile(
    @Param('trashMetadataId') trashMetadataId: string,
  ): Promise<PurgeResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.purgeFile(trashMetadataId, userId);
  }

  /**
   * DELETE /trash/all - 휴지통 비우기
   */
  @Delete('all')
  @ApiOperation({ summary: '휴지통 비우기' })
  async emptyTrash(): Promise<EmptyTrashResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.emptyTrash(userId);
  }
}
