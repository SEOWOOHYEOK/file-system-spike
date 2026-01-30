import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuditLogService } from '../../../business/audit/audit-log.service';
import { SecurityLogService } from '../../../business/audit/security-log.service';
import { FileHistoryService } from '../../../business/audit/file-history.service';
import { AuditAction } from '../../../domain/audit/enums/audit-action.enum';
import { SecurityEventType, Severity } from '../../../domain/audit/enums/security-event.enum';
import { FileChangeType } from '../../../domain/audit/enums/file-change.enum';
import { LogResult, TargetType, UserType } from '../../../domain/audit/enums/common.enum';

/**
 * 관리자 감사 로그 조회 API
 *
 * 감사 로그, 보안 로그, 파일 이력 조회
 */
@ApiTags('Admin - Audit Logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly securityLogService: SecurityLogService,
    private readonly fileHistoryService: FileHistoryService,
  ) {}

  // ========== 감사 로그 조회 ==========

  @Get()
  @ApiOperation({ summary: '감사 로그 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'userType', required: false, enum: UserType })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({ name: 'targetType', required: false, enum: TargetType })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({ name: 'result', required: false, enum: LogResult })
  @ApiQuery({ name: 'ipAddress', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getAuditLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('userId') userId?: string,
    @Query('userType') userType?: UserType,
    @Query('action') action?: AuditAction,
    @Query('targetType') targetType?: TargetType,
    @Query('targetId') targetId?: string,
    @Query('result') result?: LogResult,
    @Query('ipAddress') ipAddress?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditLogService.findByFilter(
      {
        userId,
        userType,
        action,
        targetType,
        targetId,
        result,
        ipAddress,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      { page: Number(page), limit: Number(limit) },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '감사 로그 상세 조회' })
  async getAuditLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditLogService.findById(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: '특정 사용자의 감사 로그 조회' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAuditLogsByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit = 100,
  ) {
    return this.auditLogService.findByUserId(userId, Number(limit));
  }

  @Get('target/:targetType/:targetId')
  @ApiOperation({ summary: '특정 대상의 접근 이력 조회' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAuditLogsByTarget(
    @Param('targetType') targetType: TargetType,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Query('limit') limit = 100,
  ) {
    return this.auditLogService.findByTarget(targetType, targetId, Number(limit));
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: '특정 세션의 활동 로그 조회' })
  async getAuditLogsBySession(@Param('sessionId') sessionId: string) {
    return this.auditLogService.findBySessionId(sessionId);
  }

  // ========== 보안 로그 조회 ==========

  @Get('security')
  @ApiOperation({ summary: '보안 로그 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'eventType', required: false, enum: SecurityEventType })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'ipAddress', required: false, type: String })
  @ApiQuery({ name: 'severity', required: false, enum: Severity })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getSecurityLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('eventType') eventType?: SecurityEventType,
    @Query('userId') userId?: string,
    @Query('ipAddress') ipAddress?: string,
    @Query('severity') severity?: Severity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.securityLogService.findByFilter(
      {
        eventType,
        userId,
        ipAddress,
        severity,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      { page: Number(page), limit: Number(limit) },
    );
  }

  @Get('security/user/:userId')
  @ApiOperation({ summary: '특정 사용자의 보안 로그 조회' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSecurityLogsByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit = 100,
  ) {
    return this.securityLogService.findByUserId(userId, Number(limit));
  }

  @Get('security/login-failures/ip/:ipAddress')
  @ApiOperation({ summary: 'IP별 로그인 실패 횟수 조회' })
  @ApiQuery({ name: 'since', required: false, type: String, description: '조회 시작 시간 (ISO 8601)' })
  async getLoginFailuresByIp(
    @Param('ipAddress') ipAddress: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // 기본 24시간
    const count = await this.securityLogService.countLoginFailuresByIp(
      ipAddress,
      sinceDate,
    );
    return { ipAddress, since: sinceDate.toISOString(), failureCount: count };
  }

  // ========== 파일 이력 조회 ==========

  @Get('file-history')
  @ApiOperation({ summary: '파일 이력 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'fileId', required: false, type: String })
  @ApiQuery({ name: 'changeType', required: false, enum: FileChangeType })
  @ApiQuery({ name: 'changedBy', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getFileHistories(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('fileId') fileId?: string,
    @Query('changeType') changeType?: FileChangeType,
    @Query('changedBy') changedBy?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.fileHistoryService.findByFilter(
      {
        fileId,
        changeType,
        changedBy,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      { page: Number(page), limit: Number(limit) },
    );
  }

  @Get('file-history/file/:fileId')
  @ApiOperation({ summary: '특정 파일의 변경 이력 조회' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFileHistoryByFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query('limit') limit = 100,
  ) {
    return this.fileHistoryService.findByFileId(fileId, Number(limit));
  }

  @Get('file-history/file/:fileId/version/:version')
  @ApiOperation({ summary: '특정 파일의 특정 버전 조회' })
  async getFileHistoryByVersion(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Param('version') version: number,
  ) {
    return this.fileHistoryService.findByFileIdAndVersion(fileId, Number(version));
  }

  @Get('file-history/user/:userId')
  @ApiOperation({ summary: '특정 사용자가 변경한 파일 이력 조회' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFileHistoryByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit = 100,
  ) {
    return this.fileHistoryService.findByChangedBy(userId, Number(limit));
  }
}
