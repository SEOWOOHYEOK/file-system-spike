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
import { ApiTags } from '@nestjs/swagger';
import { TrashService } from '../../business/trash';
import {
  // 데코레이터 파라미터에 사용되는 타입 (class로 정의됨)
  GetTrashListQuery,
  FileRestoreRequest,
  FolderRestoreRequest,
  // 응답 타입 (interface)
  TrashListResponse,
  TrashFolderContentsResponse,
  FileRestoreInfoResponse,
  FolderRestoreInfoResponse,
  RestoreResponse,
  RestoreAllResponse,
  PurgeResponse,
  EmptyTrashResponse,
} from '../../domain/trash';
import {
  ApiTrashList,
  ApiTrashFolderContents,
  ApiFileRestoreInfo,
  ApiFolderRestoreInfo,
  ApiFileRestore,
  ApiFolderRestore,
  ApiFilePurge,
  ApiFolderPurge,
  ApiEmptyTrash,
  ApiRestoreAll,
} from './trash.swagger';

/**
 * 휴지통 컨트롤러
 * 휴지통 조회, 복원, 영구삭제 API
 */
@ApiTags('Trash')
@Controller('trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) { }

  /**
   * GET /trash - 휴지통 목록 조회
   */
  @Get()
  @ApiTrashList()
  async getTrashList(@Query() query: GetTrashListQuery): Promise<TrashListResponse> {
    return this.trashService.getTrashList(query);
  }


  /**
   * GET /trash/files/:trashMetadataId/restore-info - 파일 복원 정보 조회
   */
  @Get('files/:trashMetadataId/restore-info')
  @ApiFileRestoreInfo()
  async getFileRestoreInfo(
    @Param('trashMetadataId') trashMetadataId: string,
  ): Promise<FileRestoreInfoResponse> {
    return this.trashService.getFileRestoreInfo(trashMetadataId);
  }

  /**
   * GET /trash/folders/:trashMetadataId/restore-info - 폴더 복원 정보 조회
   */
  @Get('folders/:trashMetadataId/restore-info')
  @ApiFolderRestoreInfo()
  async getFolderRestoreInfo(
    @Param('trashMetadataId') trashMetadataId: string,
  ): Promise<FolderRestoreInfoResponse> {
    return this.trashService.getFolderRestoreInfo(trashMetadataId);
  }

  /**
   * POST /trash/files/:trashMetadataId/restore - 파일 복원
   */
  @Post('files/:trashMetadataId/restore')
  @ApiFileRestore()
  async restoreFile(
    @Param('trashMetadataId') trashMetadataId: string,
    @Body() request: FileRestoreRequest,
  ): Promise<RestoreResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.restoreFile(trashMetadataId, request, userId);
  }

  /**
   * POST /trash/folders/:trashMetadataId/restore - 폴더 복원
   */
  @Post('folders/:trashMetadataId/restore')
  @ApiFolderRestore()
  async restoreFolder(
    @Param('trashMetadataId') trashMetadataId: string,
    @Body() request: FolderRestoreRequest,
  ): Promise<RestoreResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.restoreFolder(trashMetadataId, request, userId);
  }

  /**
   * DELETE /trash/files/:trashMetadataId - 파일 영구삭제
   */
  @Delete('files/:trashMetadataId')
  @ApiFilePurge()
  async purgeFile(
    @Param('trashMetadataId') trashMetadataId: string,
  ): Promise<PurgeResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.purgeFile(trashMetadataId, userId);
  }

  /**
   * DELETE /trash/folders/:trashMetadataId - 폴더 영구삭제
   */
  @Delete('folders/:trashMetadataId')
  @ApiFolderPurge()
  async purgeFolder(
    @Param('trashMetadataId') trashMetadataId: string,
  ): Promise<PurgeResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.purgeFolder(trashMetadataId, userId);
  }

  /**
   * DELETE /trash/all - 휴지통 비우기
   */
  @Delete('all')
  @ApiEmptyTrash()
  async emptyTrash(): Promise<EmptyTrashResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.emptyTrash(userId);
  }

  /**
   * POST /trash/restore-all - 모든 항목 복원
   */
  @Post('restore-all')
  @ApiRestoreAll()
  async restoreAll(): Promise<RestoreAllResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.trashService.restoreAll(userId);
  }
}
