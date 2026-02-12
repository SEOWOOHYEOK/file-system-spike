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
import { JwtAuthGuard } from '../../../common/guards';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { User } from '../../../common/decorators/user.decorator';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { FileActionType } from '../../../domain/file-action-request/enums/file-action-type.enum';
import { FileActionRequestCommandService } from '../../../business/file-action-request/file-action-request-command.service';
import { FileActionRequestQueryService } from '../../../business/file-action-request/file-action-request-query.service';
import { PaginatedResponseDto } from '../../common/dto';
import { CreateMoveRequestDto } from './dto/create-move-request.dto';
import { CreateDeleteRequestDto } from './dto/create-delete-request.dto';
import { FileActionRequestResponseDto } from './dto/file-action-request-response.dto';
import { FileActionRequestQueryDto } from './dto/file-action-request-query.dto';
import {
  ApiCreateMoveRequest,
  ApiCreateDeleteRequest,
  ApiGetMyRequests,
  ApiGetApprovers,
  ApiGetRequestDetail,
  ApiCancelRequest,
} from './file-action-request.swagger';

/**
 * 파일 작업 요청 컨트롤러 (요청자용)
 *
 * 일반 사용자가 파일 이동/삭제 요청을 생성, 조회, 취소하는 엔드포인트
 */
@ApiTags('750.파일 작업 요청')
@Controller('v1/file-action-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FileActionRequestController {
  constructor(
    private readonly commandService: FileActionRequestCommandService,
    private readonly queryService: FileActionRequestQueryService,
  ) {}

  /**
   * 파일 이동 요청 생성
   */
  @Post('move')
  @RequirePermissions(PermissionEnum.FILE_MOVE_REQUEST)
  @ApiCreateMoveRequest()
  @AuditAction({
    action: AuditActionEnum.FILE_ACTION_REQUEST_MOVE_CREATE,
    targetType: TargetType.FILE_ACTION_REQUEST,
    targetIdParam: 'id',
  })
  async createMoveRequest(
    @User() user: { id: string },
    @Body() dto: CreateMoveRequestDto,
  ): Promise<FileActionRequestResponseDto> {
    const result = await this.commandService.createMoveRequest(user.id, {
      fileId: dto.fileId,
      targetFolderId: dto.targetFolderId,
      reason: dto.reason,
      designatedApproverId: dto.designatedApproverId,
    });
    return FileActionRequestResponseDto.fromEntity(result);
  }

  /**
   * 파일 삭제 요청 생성
   */
  @Post('delete')
  @RequirePermissions(PermissionEnum.FILE_DELETE_REQUEST)
  @ApiCreateDeleteRequest()
  @AuditAction({
    action: AuditActionEnum.FILE_ACTION_REQUEST_DELETE_CREATE,
    targetType: TargetType.FILE_ACTION_REQUEST,
    targetIdParam: 'id',
  })
  async createDeleteRequest(
    @User() user: { id: string },
    @Body() dto: CreateDeleteRequestDto,
  ): Promise<FileActionRequestResponseDto> {
    const result = await this.commandService.createDeleteRequest(user.id, {
      fileId: dto.fileId,
      reason: dto.reason,
      designatedApproverId: dto.designatedApproverId,
    });
    return FileActionRequestResponseDto.fromEntity(result);
  }

  /**
   * 내 파일 작업 요청 목록 조회
   */
  @Get('my')
  @RequirePermissions(PermissionEnum.FILE_MOVE_REQUEST)
  @ApiGetMyRequests()
  async getMyRequests(
    @User() user: { id: string },
    @Query() query: FileActionRequestQueryDto,
  ): Promise<PaginatedResponseDto<FileActionRequestResponseDto>> {
    const filter = {
      status: query.status,
      type: query.type,
    };
    const pagination = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy ?? 'requestedAt',
      sortOrder: query.sortOrder ?? 'desc' as const,
    };
    const result = await this.queryService.getMyRequests(user.id, filter, pagination);
    return PaginatedResponseDto.from(result, FileActionRequestResponseDto.fromEntity);
  }

  /**
   * 승인 가능 사용자 목록 조회
   */
  @Get('approvers')
  @RequirePermissions(PermissionEnum.FILE_MOVE_REQUEST)
  @ApiGetApprovers()
  async getApprovers(
    @Query('type') type: FileActionType,
  ) {
    return this.queryService.getApprovers(type);
  }

  /**
   * 파일 작업 요청 상세 조회
   */
  @Get(':id')
  @RequirePermissions(PermissionEnum.FILE_MOVE_REQUEST)
  @ApiGetRequestDetail()
  async getRequestDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileActionRequestResponseDto | null> {
    const result = await this.queryService.getRequestDetail(id);
    return result ? FileActionRequestResponseDto.fromEntity(result) : null;
  }

  /**
   * 파일 작업 요청 취소
   */
  @Post(':id/cancel')
  @RequirePermissions(PermissionEnum.FILE_MOVE_REQUEST)
  @ApiCancelRequest()
  @AuditAction({
    action: AuditActionEnum.FILE_ACTION_REQUEST_CANCEL,
    targetType: TargetType.FILE_ACTION_REQUEST,
    targetIdParam: 'id',
  })
  async cancelRequest(
    @User() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileActionRequestResponseDto> {
    const result = await this.commandService.cancelRequest(id, user.id);
    return FileActionRequestResponseDto.fromEntity(result);
  }
}
