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
import { FolderQueryService, FolderCommandService, SearchService } from '../../../business/folder';
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
  SearchQuery,
  SearchResponse,
} from '../../../domain/folder';
import {
  ApiFolderCreate,
  ApiFolderInfo,
  ApiFolderContents,
  ApiFolderRename,
  ApiFolderMove,
  ApiFolderDelete,
  ApiFolderSearch,
} from './folder.swagger';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';

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
    private readonly searchService: SearchService,
  ) { }

  /**
   * POST /folders - 폴더 생성
   */
  @Post()
  @ApiFolderCreate()
  @HttpCode(HttpStatus.CREATED)
  @AuditAction({
    action: AuditActionEnum.FOLDER_CREATE,
    targetType: TargetType.FOLDER,
    targetIdParam: 'id',
    targetNameParam: 'name',
  })
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
  @AuditAction({
    action: AuditActionEnum.FOLDER_VIEW,
    targetType: TargetType.FOLDER,
    targetIdParam: 'id',
  })
  async getRootFolderInfo(): Promise<FolderInfoResponse> {
    return this.folderQueryService.getRootFolderInfo();
  }

  /**
   * GET /folders/search - 파일/폴더 검색
   */
  @Get('search')
  @ApiFolderSearch()
  async search(@Query() query: SearchQuery): Promise<SearchResponse> {
    return this.searchService.search(query);
  }

  /**
   * GET /folders/:folderId - 폴더 정보 조회
   */
  @Get(':folderId')
  @ApiFolderInfo()
  @AuditAction({
    action: AuditActionEnum.FOLDER_VIEW,
    targetType: TargetType.FOLDER,
    targetIdParam: 'folderId',
  })
  async getFolderInfo(@Param('folderId') folderId: string): Promise<FolderInfoResponse> {
    return this.folderQueryService.getFolderInfo(folderId);
  }

  /**
   * GET /folders/:folderId/contents - 폴더 내용 조회 (하위 폴더/파일)
   */
  @Get(':folderId/contents')
  @ApiFolderContents()
  @AuditAction({
    action: AuditActionEnum.FOLDER_VIEW,
    targetType: TargetType.FOLDER,
    targetIdParam: 'folderId',
  })
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
  @AuditAction({
    action: AuditActionEnum.FOLDER_RENAME,
    targetType: TargetType.FOLDER,
    targetIdParam: 'folderId',
    targetNameParam: 'newName',
  })
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
  @AuditAction({
    action: AuditActionEnum.FOLDER_MOVE,
    targetType: TargetType.FOLDER,
    targetIdParam: 'folderId',
  })
  async move(
    @Param('folderId') folderId: string,
    @Body() request: MoveFolderRequest,
  ): Promise<MoveFolderResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.이동(folderId, request, userId);
  }

  /**
   * DELETE /folders/:folderId - 폴더 삭제 (휴지통 이동)
   */
  @Delete(':folderId')
  @ApiFolderDelete()
  @AuditAction({
    action: AuditActionEnum.FOLDER_DELETE,
    targetType: TargetType.FOLDER,
    targetIdParam: 'folderId',
  })
  async delete(@Param('folderId') folderId: string): Promise<{
    id: string;
    name: string;
    state: FolderState;
    trashedAt: string;
  }> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.folderCommandService.delete(folderId, userId);
  }
}
