import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { ShareTargetUserQueryService } from '../../../business/external-share/share-target-user-query.service';
import { ShareRequestCommandService } from '../../../business/share-request/share-request-command.service';
import { ShareRequestQueryService } from '../../../business/share-request/share-request-query.service';
import { ShareRequestValidationService } from '../../../business/share-request/share-request-validation.service';
import { UserQueryService } from '../../../business/user/user-query.service';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiGetShareTargetUsers,
  ApiGetApprovers,
  ApiCheckAvailability,
  ApiCreateShareRequest,
} from './share-request-create.swagger';
import { ShareTargetUserQueryDto, ShareTargetUserDto } from './dto/share-target-user.dto';
import { CreateShareRequestDto } from '../share-request/dto/create-share-request.dto';
import { CheckAvailabilityDto } from '../share-request/dto/check-availability.dto';
import {
  ShareRequestResponseDto,
  CheckAvailabilityResponseDto,
} from '../share-request/dto/share-request-response.dto';
import { PaginatedResponseDto } from '../../common/dto';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { ApproverQueryDto } from '../share-request/dto/approver-query.dto';
import { ApproverResponseDto } from '../share-request/dto/approver-response.dto';

/**
 * 700. 파일 공유 요청 생성
 * 공유 요청 생성 플로우 전용 컨트롤러
 */
@ApiTags('700.파일 공유 요청 생성')
@Controller('v1/file-shares-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FILE_SHARE_REQUEST)
export class ShareRequestCreateController {
  constructor(
    private readonly shareTargetUserQueryService: ShareTargetUserQueryService,
    private readonly shareRequestCommandService: ShareRequestCommandService,
    private readonly shareRequestQueryService: ShareRequestQueryService,
    private readonly shareRequestValidationService: ShareRequestValidationService,
    private readonly userQueryService: UserQueryService,
  ) {}

  /**
   * R-T: 공유 대상자 통합 조회 (내부+외부)
   */
  @Get('users')
  @ApiGetShareTargetUsers()
  async getShareTargetUsers(
    @Query() query: ShareTargetUserQueryDto,
  ): Promise<PaginatedResponseDto<ShareTargetUserDto>> {
    return this.shareTargetUserQueryService.findAll(query);
  }

  /**
   * R-A: 승인 가능 사용자 검색
   */
  @Get('approvers')
  @ApiGetApprovers()
  async getApprovers(
    @Query() query: ApproverQueryDto,
  ): Promise<PaginatedResponseDto<ApproverResponseDto>> {
    const result = await this.userQueryService.findApprovers(query.keyword, query);
    return PaginatedResponseDto.from(result, ApproverResponseDto.fromItem);
  }

  /**
   * R-0: 가용성 확인
   */
  @Post('requests/check-availability')
  @ApiCheckAvailability()
  async checkAvailability(
    @Body() dto: CheckAvailabilityDto,
    @User() user: { id: string },
  ): Promise<CheckAvailabilityResponseDto> {
    const results = await this.shareRequestValidationService.checkAvailability(
      dto.fileIds,
      dto.targets.map((t) => ({ type: t.type, userId: t.userId })),
    );
    return CheckAvailabilityResponseDto.fromResults(results);
  }

  /**
   * R-1: 공유 요청 생성
   */
  @Post('requests')
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
    const shareRequest = await this.shareRequestCommandService.createShareRequest(
      user.id,
      dto.toServiceDto(),
    );
    const enriched = await this.shareRequestQueryService.enrichShareRequest(shareRequest);
    return ShareRequestResponseDto.fromEnriched(enriched);
  }
}
