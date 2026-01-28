import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PublicShareManagementService } from '../../../../business/external-share/public-share-management.service';
import { PaginationParams } from '../../../../domain/external-share/repositories/external-user.repository.interface';
import { User } from '../../../../common/decorators/user.decorator';

/**
 * 공유 관리 컨트롤러 (관리자용)
 */
@ApiTags('SharesAdmin')
@Controller('v1/admin/shares')
@ApiBearerAuth()
export class ShareAdminController {
  constructor(
    private readonly shareService: PublicShareManagementService,
  ) {}

  /**
   * 전체 공유 현황 조회
   */
  @Get()
  @ApiOperation({ summary: '전체 공유 현황 조회' })
  async getAllPublicShares(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const pagination: PaginationParams = { page, pageSize, sortBy, sortOrder };
    return this.shareService.getAllPublicShares(pagination);
  }

  /**
   * 공유 상세 조회
   */
  @Get(':id')
  @ApiOperation({ summary: '공유 상세 조회' })
  async getPublicShareById(@Param('id', ParseUUIDPipe) id: string) {
    return this.shareService.getPublicShareById(id);
  }

  /**
   * 공유 차단
   */
  @Patch(':id/block')
  @ApiOperation({ summary: '공유 차단' })
  async blockShare(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shareService.blockShare(user.id, id);
  }

  /**
   * 차단 해제
   */
  @Patch(':id/unblock')
  @ApiOperation({ summary: '차단 해제' })
  async unblockShare(@Param('id', ParseUUIDPipe) id: string) {
    return this.shareService.unblockShare(id);
  }

  /**
   * 공유된 파일 목록 조회
   */
  @Get('shared-files')
  @ApiOperation({ summary: '공유된 파일 목록 조회' })
  async getSharedFiles(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    const pagination: PaginationParams = { page, pageSize };
    return this.shareService.getSharedFiles(pagination);
  }

  /**
   * 특정 파일의 공유 목록 조회
   */
  @Get('files/:shares')
  @ApiOperation({ summary: '특정 파일의 공유 목록' })
  async getSharesByFile(@Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.shareService.getSharesByFileId(fileId);
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단
   */
  @Patch('files/:shares/block-all')
  @ApiOperation({ summary: '특정 파일의 모든 공유 일괄 차단' })
  async blockAllSharesByFile(
    @User() user: { id: string },
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.shareService.blockAllSharesByFile(user.id, fileId);
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단 해제
   */
  @Patch('files/:shares/unblock-all')
  @ApiOperation({ summary: '특정 파일의 모든 공유 일괄 차단 해제' })
  async unblockAllSharesByFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.shareService.unblockAllSharesByFile(fileId);
  }

  /**
   * 특정 외부 사용자의 모든 공유 일괄 차단
   */
  @Patch('external-users/:shares/block-all')
  @ApiOperation({ summary: '특정 외부 사용자의 모든 공유 일괄 차단' })
  async blockAllSharesByExternalUser(
    @User() user: { id: string },
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.shareService.blockAllSharesByExternalUser(user.id, userId);
  }
}
