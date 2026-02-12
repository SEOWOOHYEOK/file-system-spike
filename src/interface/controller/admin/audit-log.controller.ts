import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { AuditLogService } from '../../../business/audit/audit-log.service';
import { FileHistoryService } from '../../../business/audit/file-history.service';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { AuditLog } from '../../../domain/audit/entities/audit-log.entity';
import { FileHistory } from '../../../domain/audit/entities/file-history.entity';
import type { PaginatedResult } from '../../../domain/audit/repositories/audit-log.repository.interface';
import {
  ApiGetAuditLogs,
  ApiGetAuditLog,
  ApiGetAuditLogsByUser,
  ApiGetAuditLogsByTarget,
  ApiGetAuditLogsBySession,
  ApiGetFileHistories,
  ApiGetFileHistoryByFile,
  ApiGetFileHistoryByVersion,
  ApiGetFileHistoryByUser,
} from './audit-log.swagger';
import {
  AuditLogQueryDto,
  FileHistoryQueryDto,
  LimitQueryDto,
} from './dto';

/**
 * 관리자 감사 로그 조회 API
 *
 * 감사 로그, 파일 이력 조회
 */
@ApiTags('806.관리자 - audit log 확인')
@ApiBearerAuth()
@Controller('/v1/admin/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.AUDIT_READ)
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly fileHistoryService: FileHistoryService,
  ) {}

  // ========== 감사 로그 조회 ==========

  
  @Get()
  @ApiGetAuditLogs()
  async getAuditLogs(
    @Query() query: AuditLogQueryDto,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.auditLogService.findByFilter(
      {
        userId: query.userId,
        userType: query.userType,
        action: query.action,
        targetType: query.targetType,
        targetId: query.targetId,
        result: query.result,
        ipAddress: query.ipAddress,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      },
      { page: query.page, limit: query.limit },
    );
  }

  @Get(':id')
  @ApiGetAuditLog()
  async getAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AuditLog | null> {
    return this.auditLogService.findById(id);
  }

  @Get('user/:userId')
  @ApiGetAuditLogsByUser()
  async getAuditLogsByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: LimitQueryDto,
  ): Promise<AuditLog[]> {
    return this.auditLogService.findByUserId(userId, query.limit);
  }

  @Get('target/:targetType/:targetId')
  @ApiGetAuditLogsByTarget()
  async getAuditLogsByTarget(
    @Param('targetType') targetType: TargetType,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Query() query: LimitQueryDto,
  ): Promise<AuditLog[]> {
    return this.auditLogService.findByTarget(targetType, targetId, query.limit);
  }

  @Get('session/:sessionId')
  @ApiGetAuditLogsBySession()
  async getAuditLogsBySession(
    @Param('sessionId') sessionId: string,
  ): Promise<AuditLog[]> {
    return this.auditLogService.findBySessionId(sessionId);
  }

  // ========== 파일 이력 조회 ==========

  @Get('file-history')
  @ApiGetFileHistories()
  async getFileHistories(
    @Query() query: FileHistoryQueryDto,
  ): Promise<PaginatedResult<FileHistory>> {
    return this.fileHistoryService.findByFilter(
      {
        fileId: query.fileId,
        changeType: query.changeType,
        changedBy: query.changedBy,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      },
      { page: query.page, limit: query.limit },
    );
  }

  @Get('file-history/file/:fileId')
  @ApiGetFileHistoryByFile()
  async getFileHistoryByFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query() query: LimitQueryDto,
  ): Promise<FileHistory[]> {
    return this.fileHistoryService.findByFileId(fileId, query.limit);
  }

  @Get('file-history/file/:fileId/version/:version')
  @ApiGetFileHistoryByVersion()
  async getFileHistoryByVersion(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<FileHistory | null> {
    return this.fileHistoryService.findByFileIdAndVersion(fileId, version);
  }

  @Get('file-history/user/:userId')
  @ApiGetFileHistoryByUser()
  async getFileHistoryByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: LimitQueryDto,
  ): Promise<FileHistory[]> {
    return this.fileHistoryService.findByChangedBy(userId, query.limit);
  }
}
