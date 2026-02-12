import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { User } from '../../../common/decorators/user.decorator';
import { ShareRequestQueryService } from '../../../business/share-request/share-request-query.service';
import { ShareRequestCommandService } from '../../../business/share-request/share-request-command.service';
import type { PaginationParams } from '../../../common/types/pagination';
import { ShareRequestFilter } from '../../../domain/share-request/repositories/share-request.repository.interface';
import { ShareRequestStatus } from '../../../domain/share-request/type/share-request-status.enum';
import { PaginatedResponseDto } from '../../common/dto';
import { ShareRequestResponseDto } from '../share-request/dto/share-request-response.dto';
import {
  ReceivedRequestQueryDto,
  ApproveReceivedRequestDto,
  RejectReceivedRequestDto,
} from './dto/received-request.dto';
import {
  ApiGetReceivedRequests,
  ApiGetReceivedRequestDetail,
  ApiApproveReceivedRequest,
  ApiRejectReceivedRequest,
} from './my-received-request.swagger';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';

/**
 * 내가 받은 공유 요청 관리 컨트롤러 (승인자용)
 *
 * designatedApproverId로 지정된 사용자가 자신에게 할당된 공유 요청을 조회/승인/반려합니다.
 */
@ApiTags('702.내가 받은 파일 공유 결제 요청 관리(701-A)')
@Controller('v1/file-shares-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FILE_SHARE_APPROVE)
@ApiExtraModels(ShareRequestResponseDto)
export class MyReceivedRequestController {
  constructor(
    private readonly queryService: ShareRequestQueryService,
    private readonly commandService: ShareRequestCommandService,
  ) {}

  /**
   * R-2: 받은 공유 요청 목록
   */
  @Get('received')
  @ApiGetReceivedRequests()
  async getReceivedRequests(
    @User() user: { id: string },
    @Query() query: ReceivedRequestQueryDto,
  ): Promise<PaginatedResponseDto<ShareRequestResponseDto>> {
    const filter: ShareRequestFilter = {
      designatedApproverId: user.id,
      status: query.status ?? ShareRequestStatus.PENDING,
    };

    const pagination: PaginationParams = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy ?? 'requestedAt',
      sortOrder: query.sortOrder ?? 'desc',
    };

    const result = await this.queryService.getShareRequests(filter, pagination);
    const enrichedItems = await this.queryService.enrichShareRequests(result.items);

    return PaginatedResponseDto.from(
      { ...result, items: enrichedItems },
      (item) => ShareRequestResponseDto.fromEnriched(item),
    );
  }

  /**
   * R-3: 받은 공유 요청 상세
   */
  @Get('received/:id')
  @ApiGetReceivedRequestDetail()
  async getReceivedRequestDetail(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareRequestResponseDto> {
    const shareRequest = await this.queryService.getShareRequestDetail(id);

    if (shareRequest.designatedApproverId !== user.id) {
      throw new ForbiddenException(
        '본인에게 지정된 공유 요청만 조회할 수 있습니다.',
      );
    }

    const enriched = await this.queryService.enrichShareRequest(shareRequest);
    return ShareRequestResponseDto.fromEnriched(enriched);
  }

  /**
   * R-4: 받은 공유 요청 승인
   */
  @Post('received/:id/approve')
  @ApiApproveReceivedRequest()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_APPROVE,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async approveReceivedRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveReceivedRequestDto,
  ): Promise<ShareRequestResponseDto> {
    const shareRequest = await this.queryService.getShareRequestDetail(id);

    if (shareRequest.designatedApproverId !== user.id) {
      throw new ForbiddenException(
        '본인에게 지정된 공유 요청만 승인할 수 있습니다.',
      );
    }

    const approvedRequest = await this.commandService.approveRequest(
      id,
      user.id,
      body.comment,
    );

    const enriched = await this.queryService.enrichShareRequest(approvedRequest);
    return ShareRequestResponseDto.fromEnriched(enriched);
  }

  /**
   * R-5: 받은 공유 요청 반려
   */
  @Post('received/:id/reject')
  @ApiRejectReceivedRequest()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_REJECT,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async rejectReceivedRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectReceivedRequestDto,
  ): Promise<ShareRequestResponseDto> {
    const shareRequest = await this.queryService.getShareRequestDetail(id);

    if (shareRequest.designatedApproverId !== user.id) {
      throw new ForbiddenException(
        '본인에게 지정된 공유 요청만 반려할 수 있습니다.',
      );
    }

    const rejectedRequest = await this.commandService.rejectRequest(
      id,
      user.id,
      body.comment,
    );

    const enriched = await this.queryService.enrichShareRequest(rejectedRequest);
    return ShareRequestResponseDto.fromEnriched(enriched);
  }
}
