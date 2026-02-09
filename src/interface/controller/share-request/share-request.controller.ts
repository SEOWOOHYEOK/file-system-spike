import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import { ShareRequestCommandService } from '../../../business/share-request/share-request-command.service';
import { ShareRequestQueryService } from '../../../business/share-request/share-request-query.service';
import { ShareRequestValidationService } from '../../../business/share-request/share-request-validation.service';
import type { PaginationParams } from '../../../common/types/pagination';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiCheckAvailability,
  ApiCreateShareRequest,
  ApiGetMyShareRequests,
  ApiGetMyShareRequestDetail,
  ApiCancelMyShareRequest,
} from './share-request.swagger';
import { CreateShareRequestDto } from './dto/create-share-request.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import {
  ShareRequestResponseDto,
  CheckAvailabilityResponseDto,
} from './dto/share-request-response.dto';
import { MyShareRequestsQueryDto } from './dto/share-request-query.dto';
import { PaginatedResponseDto } from '../../common/dto';
import { ShareRequestFilter } from '../../../domain/share-request/repositories/share-request.repository.interface';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';

/**
 * 공유 요청 컨트롤러 (요청자용)
 */
@ApiTags('700.공유요청')
@Controller('v1/share-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ShareRequestController {
  constructor(
    private readonly commandService: ShareRequestCommandService,
    private readonly queryService: ShareRequestQueryService,
    private readonly validationService: ShareRequestValidationService,
  ) {}

  /**
   * R-0: 가용성 확인
   */
  @Post('check-availability')
  @ApiCheckAvailability()
  async checkAvailability(
    @Body() dto: CheckAvailabilityDto,
    @User() user: { id: string },
  ): Promise<CheckAvailabilityResponseDto> {
    const results = await this.validationService.checkAvailability(
      dto.fileIds,
      dto.targets.map((t) => ({ type: t.type, userId: t.userId })),
    );
    return CheckAvailabilityResponseDto.fromResults(results);
  }

  /**
   * R-1: 공유 요청 생성
   */
  @Post()
  @ApiCreateShareRequest()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_CREATE,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async createShareRequest(
    @User() user: { id: string },
    @Body() dto: CreateShareRequestDto,
  ): Promise<ShareRequestResponseDto> {
    const shareRequest = await this.commandService.createShareRequest(
      user.id,
      dto.toServiceDto(),
    );
    return ShareRequestResponseDto.fromEntity(shareRequest);
  }

  /**
   * R-2: 내 공유 요청 목록 조회
   */
  @Get('my')
  @ApiGetMyShareRequests()
  async getMyShareRequests(
    @User() user: { id: string },
    @Query() query: MyShareRequestsQueryDto,
  ): Promise<PaginatedResponseDto<ShareRequestResponseDto>> {
    const pagination: PaginationParams = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    const filter: ShareRequestFilter = {
      requesterId: user.id,
      ...(query.status && { status: query.status }),
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
   * R-3: 내 공유 요청 상세 조회
   */
  @Get('my/:id')
  @ApiGetMyShareRequestDetail()
  async getMyShareRequestDetail(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareRequestResponseDto> {
    const shareRequest = await this.queryService.getMyShareRequestDetail(id, user.id);
    return ShareRequestResponseDto.fromEntity(shareRequest);
  }

  /**
   * R-4: 내 공유 요청 취소
   */
  @Post('my/:id/cancel')
  @ApiCancelMyShareRequest()
  @AuditAction({
    action: AuditActionEnum.SHARE_REQUEST_CANCEL,
    targetType: TargetType.SHARE,
    targetIdParam: 'id',
  })
  async cancelMyShareRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareRequestResponseDto> {
    const shareRequest = await this.commandService.cancelRequest(id, user.id);
    return ShareRequestResponseDto.fromEntity(shareRequest);
  }
}
