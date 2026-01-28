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
import { ApiTags } from '@nestjs/swagger';
import { FolderQueryService, FolderCommandService } from '../../../business/folder';
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
} from '../../../domain/folder';
import {
  ApiFolderCreate,
  ApiFolderInfo,
  ApiFolderContents,
  ApiFolderRename,
  ApiFolderMove,
  ApiFolderDelete,
} from './folder.swagger';

/**
 * 폴더 컨트롤러
 * 폴더 생성, 조회, 관리 API
 */
@ApiTags('210.폴더')
@Controller('v1/folders')
export class FolderController {
  constructor(
    private readonly folderQueryService: FolderQueryService,
    private readonly folderCommandService: FolderCommandService,
  ) { }

  /**
   * POST /folders - 폴더 생성
   */
  @Post()
  @ApiFolderCreate()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() request: CreateFolderRequest): Promise<CreateFolderResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.생성(request, userId);
  }

  /**
   * GET /folders/root - 루트 폴더 정보 조회
   */
  @Get('root')
  @ApiFolderInfo()
  async getRootFolderInfo(): Promise<FolderInfoResponse> {
    return this.folderQueryService.getRootFolderInfo();
  }

  /**
   * GET /folders/:folderId - 폴더 정보 조회
   */
  @Get(':folderId')
  @ApiFolderInfo()
  async getFolderInfo(@Param('folderId') folderId: string): Promise<FolderInfoResponse> {
    return this.folderQueryService.getFolderInfo(folderId);
  }

  /**
   * GET /folders/:folderId/contents - 폴더 내용 조회 (하위 폴더/파일)
   */
  @Get(':folderId/contents')
  @ApiFolderContents()
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
  @ApiFolderRename()
  async rename(
    @Param('folderId') folderId: string,
    @Body() request: RenameFolderRequest,
  ): Promise<RenameFolderResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.이름변경(folderId, request, userId);
  }

  /**
   * POST /folders/:folderId/move - 폴더 이동
   */
  @Post(':folderId/move')
  @ApiFolderMove()
  async move(
    @Param('folderId') folderId: string,
    @Body() request: MoveFolderRequest,
  ): Promise<MoveFolderResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.이동(folderId, request, userId);
  }


}
