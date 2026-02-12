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
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiGetMySentShareList,
  ApiGetMySentShareDetail,
  ApiRevokeMySentShare,
} from './my-sent-share.swagger';
import {
  PublicShareResponseDto,
  RevokeShareResponseDto,
} from './dto/public-share-response.dto';
import { MySentShareQueryDto } from './dto/my-sent-share.dto';
import { MySentShareItemDto } from './dto/my-sent-share-item.dto';
import { PaginatedResponseDto } from '../../common/dto';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import type { PaginationParams } from '../../../common/types/pagination';
import { createPaginatedResult } from '../../../common/types/pagination';

/**
 * 내가 보낸 공유 관리 (701-B)
 * PublicShare 조회/상세/철회
 */
@ApiTags('701-B.내 파일 공유 관리')
@Controller('v1/file-shares/my-shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FILE_SHARE_READ)
export class MySentShareController {
  constructor(
    private readonly shareService: PublicShareManagementService,
  ) {}

  /**
   * 공유 목록 조회 (ACTIVE/REVOKED 필터)
   */
  @Get()
  @ApiGetMySentShareList()
  async getMySentShareList(
    @User() user: { id: string },
    @Query() query: MySentShareQueryDto,
  ): Promise<PaginatedResponseDto<MySentShareItemDto>> {
    const pagination: PaginationParams = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'desc',
    };

    if (query.status) {
      const isRevoked = query.status === 'REVOKED';
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

    // status 미지정 시: 전체 PublicShare 조회
    const result = await this.shareService.getMyPublicShares(
      user.id,
      pagination,
    );
    return PaginatedResponseDto.from(
      result,
      MySentShareItemDto.fromPublicShare,
    );
  }

  /**
   * 공유 상세 조회 (PublicShare)
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
   * 공유 철회 (PublicShare revoke)
   */
  @Post(':id/revoke')
  @RequirePermissions(PermissionEnum.FILE_SHARE_REQUEST)
  @ApiRevokeMySentShare()
  @AuditAction({
    action: AuditActionEnum.SHARE_REVOKE,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async revokeMySentShare(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevokeShareResponseDto> {
    const share = await this.shareService.revokeShare(user.id, id);
    return RevokeShareResponseDto.fromEntity(share);
  }
}
