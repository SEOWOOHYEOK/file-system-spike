import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards';
import { PermissionsGuard } from '../../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../../domain/role/permission.enum';
import { User } from '../../../../common/decorators/user.decorator';
import { AuditAction } from '../../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../../domain/audit/enums/common.enum';
import { FileActionRequestCommandService } from '../../../../business/file-action-request/file-action-request-command.service';
import { FileActionRequestQueryService } from '../../../../business/file-action-request/file-action-request-query.service';
import { PaginatedResponseDto, PaginationQueryDto } from '../../../common/dto';
import { FileActionRequestResponseDto } from '../../file-action-request/dto/file-action-request-response.dto';
import { FileActionRequestAdminQueryDto } from './dto/admin-query.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { BulkApproveRequestDto, BulkRejectRequestDto } from './dto/bulk-request.dto';
import {
  ApiGetAllRequests,
  ApiGetSummary,
  ApiGetMyPending,
  ApiGetAdminRequestDetail,
  ApiApproveRequest,
  ApiRejectRequest,
  ApiBulkApprove,
  ApiBulkReject,
} from './file-action-request-admin.swagger';

/**
 * 파일 작업 요청 관리자 컨트롤러
 *
 * 관리자가 파일 작업 요청을 조회, 승인, 반려하는 엔드포인트
 */
@ApiTags('810.파일 작업 요청 관리')
@Controller('v1/admin/file-action-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FileActionRequestAdminController {
  constructor(
    private readonly commandService: FileActionRequestCommandService,
    private readonly queryService: FileActionRequestQueryService,
  ) {}

  /**
   * 전체 파일 작업 요청 목록 조회
   */
  @Get()
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiGetAllRequests()
  async getAllRequests(
    @Query() query: FileActionRequestAdminQueryDto,
  ): Promise<PaginatedResponseDto<FileActionRequestResponseDto>> {
    const filter = {
      status: query.status,
      type: query.type,
      requesterId: query.requesterId,
      fileId: query.fileId,
      requestedAtFrom: query.requestedFrom ? new Date(query.requestedFrom) : undefined,
      requestedAtTo: query.requestedTo ? new Date(query.requestedTo) : undefined,
    };
    const pagination = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy ?? 'requestedAt',
      sortOrder: query.sortOrder ?? 'desc' as const,
    };
    const result = await this.queryService.getAllRequests(filter, pagination);
    return PaginatedResponseDto.from(result, FileActionRequestResponseDto.fromEntity);
  }

  /**
   * 상태별 요약
   */
  @Get('summary')
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiGetSummary()
  async getSummary() {
    return this.queryService.getSummary();
  }

  /**
   * 내 승인 대기 목록
   */
  @Get('my-pending')
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiGetMyPending()
  async getMyPendingApprovals(
    @User() user: { id: string },
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<FileActionRequestResponseDto>> {
    const pagination = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy ?? 'requestedAt',
      sortOrder: query.sortOrder ?? 'desc' as const,
    };
    const result = await this.queryService.getMyPendingApprovals(user.id, pagination);
    return PaginatedResponseDto.from(result, FileActionRequestResponseDto.fromEntity);
  }

  /**
   * 상세 조회
   */
  @Get(':id')
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiGetAdminRequestDetail()
  async getRequestDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileActionRequestResponseDto | null> {
    const result = await this.queryService.getRequestDetail(id);
    return result ? FileActionRequestResponseDto.fromEntity(result) : null;
  }

  /**
   * 승인
   */
  @Post(':id/approve')
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiApproveRequest()
  @AuditAction({
    action: AuditActionEnum.FILE_ACTION_REQUEST_APPROVE,
    targetType: TargetType.FILE_ACTION_REQUEST,
    targetIdParam: 'id',
  })
  async approveRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRequestDto,
  ): Promise<FileActionRequestResponseDto> {
    const result = await this.commandService.approveRequest(id, user.id, dto.comment);
    return FileActionRequestResponseDto.fromEntity(result);
  }

  /**
   * 반려
   */
  @Post(':id/reject')
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiRejectRequest()
  @AuditAction({
    action: AuditActionEnum.FILE_ACTION_REQUEST_REJECT,
    targetType: TargetType.FILE_ACTION_REQUEST,
    targetIdParam: 'id',
  })
  async rejectRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRequestDto,
  ): Promise<FileActionRequestResponseDto> {
    const result = await this.commandService.rejectRequest(id, user.id, dto.comment);
    return FileActionRequestResponseDto.fromEntity(result);
  }

  /**
   * 일괄 승인
   */
  @Post('bulk-approve')
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiBulkApprove()
  @AuditAction({
    action: AuditActionEnum.FILE_ACTION_REQUEST_BULK_APPROVE,
    targetType: TargetType.FILE_ACTION_REQUEST,
    targetIdParam: 'ids',
  })
  async bulkApprove(
    @User() user: { id: string },
    @Body() dto: BulkApproveRequestDto,
  ): Promise<FileActionRequestResponseDto[]> {
    const results = await this.commandService.bulkApprove(dto.ids, user.id, dto.comment);
    return results.map(FileActionRequestResponseDto.fromEntity);
  }

  /**
   * 일괄 반려
   */
  @Post('bulk-reject')
  @RequirePermissions(PermissionEnum.FILE_MOVE_APPROVE)
  @ApiBulkReject()
  @AuditAction({
    action: AuditActionEnum.FILE_ACTION_REQUEST_BULK_REJECT,
    targetType: TargetType.FILE_ACTION_REQUEST,
    targetIdParam: 'ids',
  })
  async bulkReject(
    @User() user: { id: string },
    @Body() dto: BulkRejectRequestDto,
  ): Promise<FileActionRequestResponseDto[]> {
    const results = await this.commandService.bulkReject(dto.ids, user.id, dto.comment);
    return results.map(FileActionRequestResponseDto.fromEntity);
  }
}
