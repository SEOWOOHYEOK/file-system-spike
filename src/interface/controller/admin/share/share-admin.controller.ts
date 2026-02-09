import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards';
import { PublicShareManagementService } from '../../../../business/external-share/public-share-management.service';
import { User } from '../../../../common/decorators/user.decorator';
import {
  ApiGetAllPublicShares,
  ApiGetPublicShareByIdAdmin,
  ApiBlockShare,
  ApiUnblockShare,
  ApiGetSharesByFile,
  ApiBlockAllSharesByFile,
  ApiUnblockAllSharesByFile,
  ApiBlockAllSharesByExternalUser,
} from './share-admin.swagger';
import {
  AdminShareDetailResponseDto,
  ShareBlockResponseDto,
  BulkBlockResponseDto,
  BulkUnblockResponseDto,
  SharedFileStatsDto,
} from './dto/share-admin-response.dto';
import { PublicShareListItemDto } from '../../share/dto/public-share-response.dto';
import { PaginationQueryDto, PaginatedResponseDto} from '../../../common/dto';
import { AuditAction } from '../../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';

/**
 * 공유 관리 컨트롤러 (관리자용)
 */
@ApiTags('510.관리자-공유')
@Controller('v1/admin/shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiExtraModels(PublicShareListItemDto, SharedFileStatsDto)
export class ShareAdminController {
  constructor(
    private readonly shareService: PublicShareManagementService,
  ) {}


  /**
   * 전체 공유 현황 조회
   */
  @Get()
  @ApiGetAllPublicShares()
  async getAllPublicShares(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<PublicShareListItemDto>> {
    return this.shareService.getAllPublicShares(query);
  }

  /**
   * 공유 상세 조회
   */
  @Get(':id')
  @ApiGetPublicShareByIdAdmin()
  async getPublicShareById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminShareDetailResponseDto> {
    const share = await this.shareService.getPublicShareById(id);
    return AdminShareDetailResponseDto.fromEntity(share);
  }

  /**
   * 공유 차단
   */
  @Patch(':id/block')
  @ApiBlockShare()
  @AuditAction({
    action: AuditActionEnum.SHARE_BLOCK,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async blockShare(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareBlockResponseDto> {
    const share = await this.shareService.blockShare(user.id, id);
    return ShareBlockResponseDto.fromEntity(share);
  }

  /**
   * 차단 해제
   */
  @Patch(':id/unblock')
  @ApiUnblockShare()
  @AuditAction({
    action: AuditActionEnum.SHARE_UNBLOCK,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async unblockShare(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareBlockResponseDto> {
    const share = await this.shareService.unblockShare(id);
    return ShareBlockResponseDto.fromEntity(share);
  }

  /**
   * 특정 파일의 공유 목록 조회
   */
  @Get('files/:fileId')
  @ApiGetSharesByFile()
  async getSharesByFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<AdminShareDetailResponseDto[]> {
    const shares = await this.shareService.getSharesByFileId(fileId);
    return shares.map(share => AdminShareDetailResponseDto.fromEntity(share));
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단
   */
  @Patch('files/:fileId/block-all')
  @ApiBlockAllSharesByFile()
  @AuditAction({
    action: AuditActionEnum.SHARE_BULK_BLOCK,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
  })
  async blockAllSharesByFile(
    @User() user: { id: string },
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<BulkBlockResponseDto> {
    return this.shareService.blockAllSharesByFile(user.id, fileId);
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단 해제
   */
  @Patch('files/:fileId/unblock-all')
  @ApiUnblockAllSharesByFile()
  @AuditAction({
    action: AuditActionEnum.SHARE_BULK_UNBLOCK,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
  })
  async unblockAllSharesByFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<BulkUnblockResponseDto> {
    return this.shareService.unblockAllSharesByFile(fileId);
  }

  /**
   * 특정 외부 사용자의 모든 공유 일괄 차단
   */
  @Patch('external-users/:userId/block-all')
  @ApiBlockAllSharesByExternalUser()
  @AuditAction({
    action: AuditActionEnum.SHARE_BULK_BLOCK,
    targetType: TargetType.USER,
    targetIdParam: 'userId',
  })
  async blockAllSharesByExternalUser(
    @User() user: { id: string },
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<BulkBlockResponseDto> {
    return this.shareService.blockAllSharesByExternalUser(user.id, userId);
  }
}
