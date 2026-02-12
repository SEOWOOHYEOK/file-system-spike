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
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../../domain/role/permission.enum';
import { PublicShareManagementService } from '../../../../business/external-share/public-share-management.service';
import { AdminShareQueryService } from '../../../../business/external-share/admin-share-query.service';
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
  AdminShareListItemDto,
  ShareBlockResponseDto,
  BulkBlockResponseDto,
  BulkUnblockResponseDto,
  SharedFileStatsDto,
  ShareFileInfoDto,
  ShareExternalUserInfoDto,
} from './dto/share-admin-response.dto';
import { PaginatedResponseDto} from '../../../common/dto';
import { AdminShareFilterQueryDto } from './dto/share-admin-filter-query.dto';
import { AuditAction } from '../../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';

/**
 * 공유 관리 컨트롤러 (관리자용)
 */
@ApiTags('805.관리자 - 파일 공유 관리(701-B)')
@Controller('v1/admin/shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FILE_SHARE_READ)
@ApiExtraModels(AdminShareListItemDto, SharedFileStatsDto, ShareFileInfoDto, ShareExternalUserInfoDto)
export class ShareAdminController {
  constructor(
    private readonly shareService: PublicShareManagementService,
    private readonly adminShareQueryService: AdminShareQueryService,
  ) {}


  /**
   * 전체 공유 현황 조회 (필터링 + 파일정보 + 소유자정보 + 외부사용자 정보 포함)
   */
  @Get()
  @ApiGetAllPublicShares()
  async getAllPublicShares(
    @Query() query: AdminShareFilterQueryDto,
  ): Promise<PaginatedResponseDto<AdminShareListItemDto>> {
    const result = await this.adminShareQueryService.findAllWithFilters(query);
    return PaginatedResponseDto.from(result, AdminShareListItemDto.fromEntity);
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
  @RequirePermissions(PermissionEnum.FILE_SHARE_DELETE)
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
  @RequirePermissions(PermissionEnum.FILE_SHARE_DELETE)
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
  @RequirePermissions(PermissionEnum.FILE_SHARE_DELETE)
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
  @RequirePermissions(PermissionEnum.FILE_SHARE_DELETE)
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
  @RequirePermissions(PermissionEnum.FILE_SHARE_DELETE)
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
