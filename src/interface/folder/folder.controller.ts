import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FolderQueryService, FolderCommandService } from '../../business/folder';
import {
  CreateFolderRequest,
  CreateFolderResponse,
  FolderInfoResponse,
  FolderContentsResponse,
  GetFolderContentsQuery,
  RenameFolderRequest,
  RenameFolderResponse,
  MoveFolderRequest,
  MoveFolderResponse,
  FolderState,
} from '../../domain/folder';

/**
 * 폴더 컨트롤러
 * 폴더 생성, 조회, 관리 API
 */
@Controller('folders')
export class FolderController {
  constructor(
    private readonly folderQueryService: FolderQueryService,
    private readonly folderCommandService: FolderCommandService,
  ) {}

  /**
   * POST /folders - 폴더 생성
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() request: CreateFolderRequest): Promise<CreateFolderResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.create(request, userId);
  }

  /**
   * GET /folders/:folderId - 폴더 정보 조회
   */
  @Get(':folderId')
  async getFolderInfo(@Param('folderId') folderId: string): Promise<FolderInfoResponse> {
    return this.folderQueryService.getFolderInfo(folderId);
  }

  /**
   * GET /folders/:folderId/contents - 폴더 내용 조회 (하위 폴더/파일)
   */
  @Get(':folderId/contents')
  async getFolderContents(
    @Param('folderId') folderId: string,
    @Query() query: GetFolderContentsQuery,
  ): Promise<FolderContentsResponse> {
    return this.folderQueryService.getFolderContents(folderId, query);
  }

  /**
   * PUT /folders/:folderId/rename - 폴더명 변경
   */
  @Put(':folderId/rename')
  async rename(
    @Param('folderId') folderId: string,
    @Body() request: RenameFolderRequest,
  ): Promise<RenameFolderResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.rename(folderId, request, userId);
  }

  /**
   * POST /folders/:folderId/move - 폴더 이동
   */
  @Post(':folderId/move')
  async move(
    @Param('folderId') folderId: string,
    @Body() request: MoveFolderRequest,
  ): Promise<MoveFolderResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.move(folderId, request, userId);
  }

  /**
   * DELETE /folders/:folderId - 폴더 삭제 (휴지통 이동)
   */
  @Delete(':folderId')
  async delete(@Param('folderId') folderId: string): Promise<{
    id: string;
    name: string;
    state: FolderState;
    deletedChildCount: number;
    trashedAt: string;
  }> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.delete(folderId, userId);
  }
}
