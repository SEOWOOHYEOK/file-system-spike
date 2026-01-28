import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShareManagementService } from '../../../business/share/share-management.service';
import { ShareAccessService } from '../../../business/share/share-access.service';
import { CreateShareDto } from '../../../business/share/dto/create-share.dto';
import { FileShare } from '../../../domain/share/entities/file-share.entity';
import { SharePermission } from '../../../domain/share/share-permission.enum';

// Placeholder for User decorator - assumes SSO integration provides user info
const User = () => (target: any, key: string, index: number) => {};

/**
 * Share Controller
 *
 * 파일 공유 REST API 엔드포인트
 */
@ApiTags('shares')
@Controller('v1/shares')
export class ShareController {
  constructor(
    private readonly managementService: ShareManagementService,
    private readonly accessService: ShareAccessService,
  ) {}

  /**
   * 공유 생성
   * POST /shares
   */
  @Post()
  @ApiOperation({ summary: '파일 공유 생성' })
  @ApiBearerAuth()
  async createShare(
    @User() user: { id: string },
    @Body() dto: CreateShareDto,
  ): Promise<FileShare> {
    return this.managementService.createShare(user.id, dto);
  }

  /**
   * 내가 공유한 파일 목록 조회
   * GET /shares/sent
   */
  @Get('sent')
  @ApiOperation({ summary: '내가 공유한 파일 목록 조회' })
  @ApiBearerAuth()
  async getMySharedFiles(@User() user: { id: string }): Promise<FileShare[]> {
    return this.managementService.getMySharedFiles(user.id);
  }

  /**
   * 나에게 공유된 파일 목록 조회
   * GET /shares/received
   */
  @Get('received')
  @ApiOperation({ summary: '나에게 공유된 파일 목록 조회' })
  @ApiBearerAuth()
  async getSharedWithMe(@User() user: { id: string }): Promise<FileShare[]> {
    return this.accessService.getMyShares(user.id);
  }

  /**
   * 공유 취소
   * DELETE /shares/:shareId
   */
  @Delete(':shareId')
  @ApiOperation({ summary: '공유 취소' })
  @ApiBearerAuth()
  async revokeShare(
    @User() user: { id: string },
    @Param('shareId') shareId: string,
  ): Promise<void> {
    return this.managementService.revokeShare(user.id, shareId);
  }

  /**
   * 공유 접근 (VIEW/DOWNLOAD 검증)
   * GET /shares/:shareId/access?permission=VIEW|DOWNLOAD
   */
  @Get(':shareId/access')
  @ApiOperation({ summary: '공유 접근 (권한 검증)' })
  @ApiBearerAuth()
  async accessShare(
    @User() user: { id: string },
    @Param('shareId') shareId: string,
    @Query('permission') permission: SharePermission,
  ): Promise<FileShare> {
    return this.accessService.validateAndTrackAccess(
      shareId,
      user.id,
      permission,
    );
  }
}
