import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards';
import { User } from '../../../../common/decorators/user.decorator';
import { ShareRequestCommandService } from '../../../../business/share-request/share-request-command.service';
import { ShareRequestQueryService } from '../../../../business/share-request/share-request-query.service';
import type { PaginationParams } from '../../../../common/types/pagination';
import { ShareRequestFilter } from '../../../../domain/share-request/repositories/share-request.repository.interface';
import { PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import {
  ShareRequestAdminQueryDto,
  ApproveRequestDto,
  RejectRequestDto,
  BulkApproveRequestDto,
  BulkRejectRequestDto,
  ShareRequestSummaryDto,
  ShareRequestAdminDetailDto,
  BulkDecisionResponseDto,
  SharesByTargetResponseDto,
  SharesByFileResponseDto,
} from './dto';
import {
  ApiGetShareRequestSummary,
  ApiGetShareRequests,
  ApiGetShareRequestDetail,
  ApiApproveShareRequest,
  ApiRejectShareRequest,
  ApiBulkApproveShareRequests,
  ApiBulkRejectShareRequests,
  ApiGetSharesByTarget,
  ApiGetSharesByFile,
} from './share-request-admin.swagger';
import { ShareRequestResponseDto } from '../../share-request/dto/share-request-response.dto';
import { AuditAction } from '../../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';

/**
 * 공유 요청 관리 컨트롤러 (관리자용)
 */
@ApiTags('520.관리자-공유요청')
@Controller('v1/admin/share-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiExtraModels(ShareRequestResponseDto)
export class ShareRequestAdminController {
  constructor(
    private readonly commandService: ShareRequestCommandService,
    private readonly queryService: ShareRequestQueryService,
  ) {}

  /**
   * A-1: 상태별 카운트 조회
   */
  @Get('summary')
  @ApiGetShareRequestSummary()
  async getSummary(): Promise<ShareRequestSummaryDto> {
    const summary = await this.queryService.getSummary();
    return summary as ShareRequestSummaryDto;
  }

  /**
   * Q-1: 대상자별 조회
   */
  @Get('by-target/:userId')
  @ApiGetSharesByTarget()
  async getSharesByTarget(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ShareRequestAdminQueryDto,
  ): Promise<SharesByTargetResponseDto> {
    const pagination: PaginationParams = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    const result = await this.queryService.getSharesByTarget(userId, pagination);
    
    // 서비스에서 이미 페이지네이션된 결과를 반환하므로,
    // 전체 아이템 수는 요약 정보의 활성 공유 수 + 대기 요청 수로 추정
    // 정확한 수는 서비스 레이어에서 계산해야 하지만, 현재는 대략 추정
    const estimatedTotal = result.summary.activeShareCount + result.summary.pendingRequestCount;
    const totalItems = Math.max(estimatedTotal, result.items.length);
    
    return SharesByTargetResponseDto.fromResult(result, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    });
  }

  /**
   * Q-2: 파일별 조회
   */
  @Get('by-file/:fileId')
  @ApiGetSharesByFile()
  async getSharesByFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query() query: ShareRequestAdminQueryDto,
  ): Promise<SharesByFileResponseDto> {
    const pagination: PaginationParams = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    const result = await this.queryService.getSharesByFile(fileId, pagination);
    
    // 서비스에서 이미 페이지네이션된 결과를 반환하므로,
    // 전체 아이템 수는 요약 정보의 활성 공유 수 + 대기 요청 수로 추정
    const estimatedTotal = result.summary.activeShareCount + result.summary.pendingRequestCount;
    const totalItems = Math.max(estimatedTotal, result.items.length);
    
    return SharesByFileResponseDto.fromResult(result, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    });
  }

  /**
   * A-6: 일괄 승인
   */
  @Post('bulk-approve')
  @ApiBulkApproveShareRequests()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_BULK_APPROVE,
    targetType: TargetType.SHARE,
  })
  async bulkApprove(
    @User() user: { id: string },
    @Body() body: BulkApproveRequestDto,
  ): Promise<BulkDecisionResponseDto> {
    const approvedRequests = await this.commandService.bulkApprove(
      body.ids,
      user.id,
      body.comment,
    );
    
    return {
      processedCount: approvedRequests.length,
      items: approvedRequests.map((req) => ({
        id: req.id,
        success: true,
      })),
    };
  }

  /**
   * A-7: 일괄 반려
   */
  @Post('bulk-reject')
  @ApiBulkRejectShareRequests()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_BULK_REJECT,
    targetType: TargetType.SHARE,
  })
  async bulkReject(
    @User() user: { id: string },
    @Body() body: BulkRejectRequestDto,
  ): Promise<BulkDecisionResponseDto> {
    const rejectedRequests = await this.commandService.bulkReject(
      body.ids,
      user.id,
      body.comment,
    );
    
    return {
      processedCount: rejectedRequests.length,
      items: rejectedRequests.map((req) => ({
        id: req.id,
        success: true,
      })),
    };
  }

  /**
   * A-2: 요청 목록 조회 (필터+페이지네이션)
   */
  @Get()
  @ApiGetShareRequests()
  async getShareRequests(
    @Query() query: ShareRequestAdminQueryDto,
  ): Promise<PaginatedResponseDto<ShareRequestResponseDto>> {
    // Query DTO를 ShareRequestFilter로 변환
    const filter: ShareRequestFilter = {
      status: query.status,
      requesterId: query.requesterId,
      fileId: query.fileId,
      targetUserId: query.targetUserId,
      requestedAtFrom: query.requestedFrom ? new Date(query.requestedFrom) : undefined,
      requestedAtTo: query.requestedTo ? new Date(query.requestedTo) : undefined,
    };

    // 정렬 파라미터 파싱 (sort: "field,dir" 형식)
    let sortBy: string | undefined;
    let sortOrder: 'asc' | 'desc' | undefined;
    if (query.sort) {
      const [field, dir] = query.sort.split(',');
      sortBy = field;
      sortOrder = dir === 'asc' ? 'asc' : 'desc';
    }

    const pagination: PaginationParams = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: sortBy || query.sortBy,
      sortOrder: sortOrder || query.sortOrder,
    };

    const result = await this.queryService.getShareRequests(filter, pagination);
    
    return {
      items: result.items.map((item) => ShareRequestResponseDto.fromEntity(item)),
      page: result.page,
      pageSize: result.pageSize,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      hasNext: result.hasNext,
      hasPrev: result.hasPrev,
    };
  }

  /**
   * A-3: 요청 상세 조회
   */
  @Get(':id')
  @ApiGetShareRequestDetail()
  async getShareRequestDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareRequestAdminDetailDto> {
    const shareRequest = await this.queryService.getShareRequestDetail(id);
    return ShareRequestAdminDetailDto.fromEntity(shareRequest);
  }

  /**
   * A-4: 단건 승인
   */
  @Post(':id/approve')
  @ApiApproveShareRequest()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_APPROVE,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async approveShareRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveRequestDto,
  ): Promise<ShareRequestResponseDto> {
    const approvedRequest = await this.commandService.approveRequest(
      id,
      user.id,
      body.comment,
    );
    return ShareRequestResponseDto.fromEntity(approvedRequest);
  }

  /**
   * A-5: 단건 반려
   */
  @Post(':id/reject')
  @ApiRejectShareRequest()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_REJECT,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async rejectShareRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectRequestDto,
  ): Promise<ShareRequestResponseDto> {
    const rejectedRequest = await this.commandService.rejectRequest(
      id,
      user.id,
      body.comment,
    );
    return ShareRequestResponseDto.fromEntity(rejectedRequest);
  }
}
