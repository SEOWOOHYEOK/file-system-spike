import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
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
  SearchHistoryQuery,
  SearchHistoryResponse,
} from '../../../domain/search-history';
import { RequestContext } from '../../../common/context/request-context';
import {
  ApiFolderCreate,
  ApiFolderInfo,
  ApiFolderContents,
  ApiFolderRename,
  ApiFolderMove,
  ApiFolderDelete,
  ApiFolderSearch,
  ApiSearchHistory,
  ApiDeleteSearchHistory,
  ApiDeleteAllSearchHistory,
} from './folder.swagger';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NasAvailabilityGuard } from '../../../common/guards/nas-availability.guard';
/**
 * 폴더 컨트롤러
 * 폴더 생성, 조회, 관리 API
 */
@ApiTags('210.폴더')
@UseGuards(JwtAuthGuard, NasAvailabilityGuard)
@Controller('v1/folders')
export class FolderController {
  private readonly logger = new Logger(FolderController.name);

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
    this.logger.log(
      `폴더 생성 요청: name=${request.name}, parentId=${request.parentId}, userId=${RequestContext.getUserId()}`,
    );
    return this.folderCommandService.생성(request);
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
   * GET /folders/search/history - 내 검색 내역 조회
   */
  @Get('search/history')
  @ApiSearchHistory()
  async getSearchHistory(
    @Query() query: SearchHistoryQuery,
  ): Promise<SearchHistoryResponse> {
    const userId = RequestContext.getUserId() || 'unknown';
    return this.searchService.getSearchHistory(
      userId,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }
  

  /**
   * DELETE /folders/search/history/:historyId - 검색 내역 단건 삭제
   */
  @Delete('search/history/:historyId')
  @ApiDeleteSearchHistory()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSearchHistory(
    @Param('historyId') historyId: string,
  ): Promise<void> {
    const userId = RequestContext.getUserId() || 'unknown';
    return this.searchService.deleteSearchHistory(historyId, userId);
  }

  /**
   * DELETE /folders/search/history - 전체 검색 내역 삭제
   */
  @Delete('search/history')
  @ApiDeleteAllSearchHistory()
  async deleteAllSearchHistory(): Promise<{ deletedCount: number }> {
    const userId = RequestContext.getUserId() || 'unknown';
    return this.searchService.deleteAllSearchHistory(userId);
  }

  /**
   * GET /folders/search - 파일/폴더 검색
   */
  @Get('search')
  @ApiFolderSearch()
  async search(@Query() query: SearchQuery): Promise<SearchResponse> {
    const userId = RequestContext.getUserId();
    return this.searchService.search(query, userId);
  }

  /**
   * GET /folders/:folderId - 폴더 정보 조회
   */
  @Get(':folderId')
  @ApiFolderInfo()
  // @AuditAction({
  //   action: AuditActionEnum.FOLDER_VIEW,
  //   targetType: TargetType.FOLDER,
  //   targetIdParam: 'folderId',
  // })
  async getFolderInfo(@Param('folderId') folderId: string): Promise<FolderInfoResponse> {
    return this.folderQueryService.getFolderInfo(folderId);
  }

  /**
   * GET /folders/:folderId/contents - 폴더 내용 조회 (하위 폴더/파일)
   */
  @Get(':folderId/contents')
  @ApiFolderContents()
  // @AuditAction({
  //   action: AuditActionEnum.FOLDER_VIEW,
  //   targetType: TargetType.FOLDER,
  //   targetIdParam: 'folderId',
  // })
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
    this.logger.log(
      `폴더 이름변경 요청: folderId=${folderId}, newName=${request.newName}, userId=${RequestContext.getUserId()}`,
    );
    return this.folderCommandService.이름변경(folderId, request);
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
    this.logger.log(
      `폴더 이동 요청: folderId=${folderId}, targetParentId=${request.targetParentId}, userId=${RequestContext.getUserId()}`,
    );
    return this.folderCommandService.이동(folderId, request);
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
    const userId = RequestContext.getUserId() || 'unknown';
    this.logger.log(
      `폴더 삭제(휴지통 이동) 요청: folderId=${folderId}, userId=${userId}`,
    );
    return this.folderCommandService.delete(folderId, userId);
  }
}
