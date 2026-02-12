/**
 * 멀티파트 업로드 컨트롤러
 * 대용량 파일 (100MB 이상) 업로드 API + Virtual Queue
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { MultipartUploadService, UploadQueueService } from '../../../business/file';
import { UploadPartResponse } from '../../../domain/upload-session/dto/upload-part.dto';
import { SessionStatusResponse } from '../../../domain/upload-session/dto/session-status.dto';
import { AbortSessionResponse } from '../../../domain/upload-session/dto/session-status.dto';
import { RequestContext } from '../../../common/context/request-context';
import {
  CompleteMultipartResponse,
  PartInfo,
} from '../../../domain/upload-session/dto/complete-multipart.dto';
import type {
  InitiateOrQueueResponse,
  QueueStatusResponse as QueueStatusDto,
  QueueOverallStatusResponse,
} from '../../../domain/upload-session/dto/upload-queue.dto';
import {
  ApiMultipartInitiate,
  ApiMultipartUploadPart,
  ApiMultipartComplete,
  ApiMultipartStatus,
  ApiMultipartAbort,
  ApiQueueStatus,
  ApiQueueCancel,
  ApiQueueOverallStatus,
} from './multipart.swagger';

import { UnifiedJwtAuthGuard } from '../../../common/guards/unified-jwt-auth.guard';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';

/**
 * 초기화 요청 DTO
 */
interface InitiateRequestBody {
  fileName: string;
  folderId: string;
  totalSize: number;
  mimeType: string;
}

/**
 * 완료 요청 DTO
 */
interface CompleteRequestBody {
  parts?: PartInfo[];
}

/**
 * 멀티파트 업로드 컨트롤러
 */
@ApiTags('201.파일-멀티파트')
@ApiBearerAuth()
@UseGuards(UnifiedJwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionEnum.FILE_UPLOAD)
@Controller('v1/files/multipart')
export class MultipartController {
  private readonly logger = new Logger(MultipartController.name);

  constructor(
    private readonly multipartUploadService: MultipartUploadService,
    private readonly uploadQueueService: UploadQueueService,
  ) { }

  /**
   * POST /files/multipart/initiate - 멀티파트 업로드 초기화 (Admission Control)
   *
   * 슬롯이 있으면 201 + 세션 정보 반환
   * 슬롯이 없으면 202 + 대기열 티켓 반환
   */
  @Post('initiate')
  @ApiMultipartInitiate()
  async initiate(
    @Body() body: InitiateRequestBody,
    @Res() res: Response,
  ): Promise<void> {
    const userId = RequestContext.getUserId();
    this.logger.log(
      `멀티파트 업로드 초기화 요청: fileName=${body.fileName}, folderId=${body.folderId}, totalSize=${body.totalSize}, userId=${userId}`,
    );

    const result: InitiateOrQueueResponse = await this.uploadQueueService.tryInitiateOrEnqueue(
      {
        fileName: body.fileName,
        folderId: body.folderId,
        totalSize: body.totalSize,
        mimeType: body.mimeType,
      },
      userId ?? 'anonymous',
    );

    if (result.status === 'ACTIVE') {
      res.status(HttpStatus.CREATED).json(result);
    } else {
      res.status(HttpStatus.ACCEPTED).json(result);
    }
  }

  // ============================================
  // 대기열 (Virtual Queue) 엔드포인트
  // ※ 반드시 :sessionId 동적 라우트보다 위에 선언해야 함
  // ============================================

  /**
   * GET /files/multipart/queue/status - 전체 대기열 현황
   */
  @Get('queue/status')
  @ApiQueueOverallStatus()
  async getQueueOverallStatus(): Promise<QueueOverallStatusResponse> {
    return this.uploadQueueService.getOverallStatus();
  }

  /**
   * GET /files/multipart/queue/:ticket - 대기열 상태 조회 (폴링)
   */
  @Get('queue/:ticket')
  @ApiQueueStatus()
  async getQueueTicketStatus(
    @Param('ticket') ticket: string,
  ): Promise<QueueStatusDto> {
    return this.uploadQueueService.getQueueStatus(ticket);
  }

  /**
   * DELETE /files/multipart/queue/:ticket - 대기열 취소
   */
  @Delete('queue/:ticket')
  @ApiQueueCancel()
  @HttpCode(HttpStatus.OK)
  async cancelQueueTicket(
    @Param('ticket') ticket: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `대기열 취소 요청: ticket=${ticket}, userId=${RequestContext.getUserId()}`,
    );
    return this.uploadQueueService.cancelQueue(ticket);
  }

  // ============================================
  // 세션 동적 라우트 (:sessionId)
  // ============================================

  /**
   * PUT /files/multipart/:sessionId/parts/:partNumber - 파트 업로드 (스트리밍)
   *
   * req 자체를 Readable stream으로 서비스에 직접 전달하여
   * Buffer 수집 없이 스트리밍 처리합니다.
   * 메모리 사용량: 파트당 ~10MB → ~128KB
   */
  @Put(':sessionId/parts/:partNumber')
  @ApiMultipartUploadPart()
  @HttpCode(HttpStatus.OK)
  async uploadPart(
    @Param('sessionId') sessionId: string,
    @Param('partNumber') partNumber: string,
    @Req() req: Request,
  ): Promise<UploadPartResponse> {
    this.logger.debug(
      `멀티파트 파트 업로드(스트림): sessionId=${sessionId}, partNumber=${partNumber}`,
    );

    return this.multipartUploadService.uploadPartStream({
      sessionId,
      partNumber: parseInt(partNumber, 10),
      stream: req,
    });
  }

  /**
   * POST /files/multipart/:sessionId/complete - 멀티파트 업로드 완료
   */
  @Post(':sessionId/complete')
  @ApiMultipartComplete()
  @HttpCode(HttpStatus.ACCEPTED)
  @AuditAction({
    action: AuditActionEnum.FILE_UPLOAD,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
    targetNameParam: 'name',
  })
  async complete(
    @Param('sessionId') sessionId: string,
    @Body() body?: CompleteRequestBody,
  ): Promise<CompleteMultipartResponse> {
    const userId = RequestContext.getUserId();
    this.logger.log(
      `멀티파트 업로드 완료 요청: sessionId=${sessionId}, userId=${userId}`,
    );
    const result = await this.multipartUploadService.complete({
      sessionId,
      parts: body?.parts,
      createdBy: userId,
    });

    // 세션 완료 → 슬롯 해제 → 대기열 승격
    this.uploadQueueService.promoteNext().catch((err) => {
      this.logger.error('대기열 승격 실패', err);
    });

    return result;
  }

  /**
   * GET /files/multipart/:sessionId/status - 세션 상태 조회
   */
  @Get(':sessionId/status')
  @ApiMultipartStatus()
  async getStatus(
    @Param('sessionId') sessionId: string,
  ): Promise<SessionStatusResponse> {
    return this.multipartUploadService.getStatus(sessionId);
  }

  /**
   * DELETE /files/multipart/:sessionId - 업로드 취소
   */
  @Delete(':sessionId')
  @ApiMultipartAbort()
  @HttpCode(HttpStatus.OK)
  async abort(
    @Param('sessionId') sessionId: string,
  ): Promise<AbortSessionResponse> {
    this.logger.log(
      `멀티파트 업로드 취소 요청: sessionId=${sessionId}, userId=${RequestContext.getUserId()}`,
    );
    const result = await this.multipartUploadService.abort(sessionId);

    // 세션 취소 → 슬롯 해제 → 대기열 승격
    this.uploadQueueService.promoteNext().catch((err) => {
      this.logger.error('대기열 승격 실패', err);
    });

    return result;
  }
}
