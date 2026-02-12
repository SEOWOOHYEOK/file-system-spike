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
import { ShareRequestCommandService } from '../../../business/share-request/share-request-command.service';
import { ShareRequestQueryService } from '../../../business/share-request/share-request-query.service';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiGetMySentShareRequests,
  ApiCancelMySentShareRequest,
} from './my-sent-share-request.swagger';
import { ShareRequestResponseDto } from '../share-request/dto/share-request-response.dto';
import { MySentShareRequestQueryDto } from './dto/my-sent-share-request-query.dto';
import { MySentShareItemDto } from './dto/my-sent-share-item.dto';
import { PaginatedResponseDto } from '../../common/dto';
import { ShareRequestFilter } from '../../../domain/share-request/repositories/share-request.repository.interface';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import type { PaginationParams } from '../../../common/types/pagination';

/**
 * 내가 보낸 결제 요청 관리 (701-A)
 * ShareRequest 조회/취소
 */
@ApiTags('701-A.내가 보낸 파일 공유 결제 요청 관리')
@Controller('v1/file-shares-requests/my-sent-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FILE_SHARE_READ)
export class MySentShareRequestController {
  constructor(
    private readonly shareRequestCommandService: ShareRequestCommandService,
    private readonly shareRequestQueryService: ShareRequestQueryService,
  ) {}

  /**
   * 결제 요청 목록 조회
   */
  @Get()
  @ApiGetMySentShareRequests()
  async getMySentShareRequests(
    @User() user: { id: string },
    @Query() query: MySentShareRequestQueryDto,
  ): Promise<PaginatedResponseDto<MySentShareItemDto>> {
    const pagination: PaginationParams = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'desc',
    };

    const filter: ShareRequestFilter = {
      requesterId: user.id,
      ...(query.status && { status: query.status }),
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

  /**
   * 결제 요청 취소
   */
  @Post(':id/cancel')
  @RequirePermissions(PermissionEnum.FILE_SHARE_REQUEST)
  @ApiCancelMySentShareRequest()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_CANCEL,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async cancelMySentShareRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareRequestResponseDto> {
    const shareRequest =
      await this.shareRequestCommandService.cancelRequest(id, user.id);
    const enriched =
      await this.shareRequestQueryService.enrichShareRequest(shareRequest);
    return ShareRequestResponseDto.fromEnriched(enriched);
  }
}
