/**
 * 멀티파트 업로드 컨트롤러
 * 대용량 파일 (100MB 이상) 업로드 API
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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { MultipartUploadService } from '../../../business/file';
import { InitiateMultipartResponse } from '../../../domain/upload-session/dto/initiate-multipart.dto';
import { UploadPartResponse } from '../../../domain/upload-session/dto/upload-part.dto';
import { SessionStatusResponse } from '../../../domain/upload-session/dto/session-status.dto';
import { AbortSessionResponse } from '../../../domain/upload-session/dto/session-status.dto';
import { RequestContext } from '../../../common/context/request-context';
import {
  CompleteMultipartResponse,
  PartInfo,
} from '../../../domain/upload-session/dto/complete-multipart.dto';
import {
  ApiMultipartInitiate,
  ApiMultipartUploadPart,
  ApiMultipartComplete,
  ApiMultipartStatus,
  ApiMultipartAbort,
} from './multipart.swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
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
  conflictStrategy?: string;
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
@UseGuards(JwtAuthGuard)
@Controller('v1/files/multipart')
export class MultipartController {
  private readonly logger = new Logger(MultipartController.name);

  constructor(
    private readonly multipartUploadService: MultipartUploadService,
  ) { }

  /**
   * POST /files/multipart/initiate - 멀티파트 업로드 초기화
   */
  @Post('initiate')
  @ApiMultipartInitiate()
  @HttpCode(HttpStatus.CREATED)
  async initiate(
    @Body() body: InitiateRequestBody,
  ): Promise<InitiateMultipartResponse> {
    this.logger.log(
      `멀티파트 업로드 초기화 요청: fileName=${body.fileName}, folderId=${body.folderId}, totalSize=${body.totalSize}, userId=${RequestContext.getUserId()}`,
    );
    return this.multipartUploadService.initiate({
      fileName: body.fileName,
      folderId: body.folderId,
      totalSize: body.totalSize,
      mimeType: body.mimeType,
      conflictStrategy: body.conflictStrategy,
    });
  }

  /**
   * PUT /files/multipart/:sessionId/parts/:partNumber - 파트 업로드
   */
  @Put(':sessionId/parts/:partNumber')
  @ApiMultipartUploadPart()
  @HttpCode(HttpStatus.OK)
  async uploadPart(
    @Param('sessionId') sessionId: string,
    @Param('partNumber') partNumber: string,
    @Req() req: Request,
  ): Promise<UploadPartResponse> {
    // Raw body 수집 (application/octet-stream)
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const data = Buffer.concat(chunks);

    this.logger.debug(
      `멀티파트 파트 업로드: sessionId=${sessionId}, partNumber=${partNumber}, dataSize=${data.length}`,
    );

    return this.multipartUploadService.uploadPart({
      sessionId,
      partNumber: parseInt(partNumber, 10),
      data,
    });
  }

  /**
   * POST /files/multipart/:sessionId/complete - 멀티파트 업로드 완료
   */
  @Post(':sessionId/complete')
  @ApiMultipartComplete()
  @HttpCode(HttpStatus.OK)
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
    return this.multipartUploadService.complete({
      sessionId,
      parts: body?.parts,
      createdBy: userId,
    });
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
    return this.multipartUploadService.abort(sessionId);
  }
}
