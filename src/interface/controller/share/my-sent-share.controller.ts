import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { PublicShareManagementService } from '../../../business/external-share/public-share-management.service';
import { ShareRequestCommandService } from '../../../business/share-request/share-request-command.service';
import { ShareRequestQueryService } from '../../../business/share-request/share-request-query.service';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiGetMySentShareList,
  ApiGetMySentShareDetail,
  ApiCancelMySentShare,
} from './my-sent-share.swagger';
import {
  PublicShareResponseDto,
  RevokeShareResponseDto,
} from './dto/public-share-response.dto';
import { ShareRequestResponseDto } from '../share-request/dto/share-request-response.dto';
import { MySentShareQueryDto } from './dto/my-sent-share.dto';
import { MySentShareItemDto } from './dto/my-sent-share-item.dto';
import { PaginatedResponseDto } from '../../common/dto';
import { ShareRequestFilter } from '../../../domain/share-request/repositories/share-request.repository.interface';
import { ShareRequestStatus } from '../../../domain/share-request/type/share-request-status.enum';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { BusinessException } from '../../../common/exceptions';
import { ErrorCodes } from '../../../common/exceptions';
import type { PaginationParams } from '../../../common/types/pagination';
import { createPaginatedResult } from '../../../common/types/pagination';

/**
 * 내가 보낸 공유 관리 (701)
 * ShareRequest + PublicShare 통합 조회/취소
 */
@ApiTags('701.내가 보낸 파일 공유 관리')
@Controller('v1/file-shares-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FILE_SHARE_READ)
export class MySentShareController {
  constructor(
    private readonly shareService: PublicShareManagementService,
    private readonly shareRequestCommandService: ShareRequestCommandService,
    private readonly shareRequestQueryService: ShareRequestQueryService,
  ) {}

  /**
   * S-1: 내 공유 통합 목록 (PENDING/ACTIVE/REVOKED 등 상태 필터)
   */
  @Get()
  @ApiGetMySentShareList()
  async getMySentShareList(
    @User() user: { id: string },
    @Query() query: MySentShareQueryDto,
  ): Promise<PaginatedResponseDto<MySentShareItemDto>> {
    const status = query.status;
    const pagination: PaginationParams = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'desc',
    };

    const shareRequestStatuses = [
      ShareRequestStatus.PENDING,
      ShareRequestStatus.APPROVED,
      ShareRequestStatus.REJECTED,
      ShareRequestStatus.CANCELED,
    ];

    if (status && shareRequestStatuses.includes(status as ShareRequestStatus)) {
      const filter: ShareRequestFilter = {
        requesterId: user.id,
        status: status as ShareRequestStatus,
      };
      const result = await this.shareRequestQueryService.getShareRequests(
        filter,
        pagination,
      );
      return PaginatedResponseDto.from(
        result,
        MySentShareItemDto.fromShareRequest,
      );
    }

    if (status === 'ACTIVE' || status === 'REVOKED') {
      const isRevoked = status === 'REVOKED';
      const allFiltered: MySentShareItemDto[] = [];
      const maxPages = 50;
      let currentPage = 1;

      while (currentPage <= maxPages) {
        const result = await this.shareService.getMyPublicShares(user.id, {
          ...pagination,
          page: currentPage,
          pageSize: 100,
        });
        const filtered = result.items
          .filter((s) => s.isRevoked === isRevoked)
          .map(MySentShareItemDto.fromPublicShare);
        allFiltered.push(...filtered);

        if (result.items.length < 100) break;
        currentPage++;
      }

      const start = (pagination.page - 1) * pagination.pageSize;
      const items = allFiltered.slice(start, start + pagination.pageSize);
      const paginated = createPaginatedResult(
        items,
        pagination.page,
        pagination.pageSize,
        allFiltered.length,
      );
      return PaginatedResponseDto.from(paginated, (x) => x);
    }

    const fetchSize = Math.min(
      pagination.page * pagination.pageSize,
      500,
    );
    const [srResult, psResult] = await Promise.all([
      this.shareRequestQueryService.getShareRequests(
        { requesterId: user.id },
        { ...pagination, page: 1, pageSize: fetchSize },
      ),
      this.shareService.getMyPublicShares(user.id, {
        ...pagination,
        page: 1,
        pageSize: fetchSize,
      }),
    ]);

    const srItems = srResult.items.map(MySentShareItemDto.fromShareRequest);
    const psItems = psResult.items.map(MySentShareItemDto.fromPublicShare);
    const merged = [...srItems, ...psItems].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const totalItems = srResult.totalItems + psResult.totalItems;
    const start = (pagination.page - 1) * pagination.pageSize;
    const items = merged.slice(start, start + pagination.pageSize);
    const paginated = createPaginatedResult(
      items,
      pagination.page,
      pagination.pageSize,
      totalItems,
    );
    return PaginatedResponseDto.from(paginated, (x) => x);
  }

  /**
   * S-2: 공유 상세 조회 (PublicShare)
   */
  @Get(':id')
  @ApiGetMySentShareDetail()
  async getMySentShareDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicShareResponseDto> {
    const share = await this.shareService.getPublicShareById(id);
    return PublicShareResponseDto.fromEntity(share);
  }

  /**
   * S-3: 공유 취소/철회 (통합)
   * PENDING ShareRequest → cancel, ACTIVE PublicShare → revoke
   */
  @Post(':id/cancel')
  @RequirePermissions(PermissionEnum.FILE_SHARE_REQUEST)
  @ApiCancelMySentShare()
  @AuditAction({
    action: AuditActionEnum.SHARE_REVOKE,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async cancelMySentShare(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareRequestResponseDto | RevokeShareResponseDto> {
    try {
      const shareRequest =
        await this.shareRequestCommandService.cancelRequest(id, user.id);
      const enriched = await this.shareRequestQueryService.enrichShareRequest(shareRequest);
      return ShareRequestResponseDto.fromEnriched(enriched);
    } catch (e) {
      if (
        e instanceof BusinessException &&
        e.internalCode === 'SHARE_REQUEST_NOT_FOUND'
      ) {
        try {
          const share = await this.shareService.revokeShare(user.id, id);
          return RevokeShareResponseDto.fromEntity(share);
        } catch (revokeError) {
          if (
            revokeError instanceof BusinessException &&
            revokeError.internalCode === 'PUBLIC_SHARE_NOT_FOUND'
          ) {
            throw BusinessException.of(ErrorCodes.SHARE_REQUEST_NOT_FOUND, {
              requestId: id,
            });
          }
          throw revokeError;
        }
      }
      throw e;
    }
  }
}
