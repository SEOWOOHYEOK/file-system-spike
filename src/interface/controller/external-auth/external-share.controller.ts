import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  ParseUUIDPipe,
  Headers,
  Ip,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExternalJwtAuthGuard } from '../../../common/guards';
import type { Response } from 'express';
import { ExternalShareAccessService } from '../../../business/external-share/external-share-access.service';
import { PaginationParams } from '../../../domain/external-share/repositories/external-user.repository.interface';
import { AccessAction } from '../../../domain/external-share/entities/share-access-log.entity';
import { ExternalUser } from '../../../common/decorators/external-user.decorator';
import {
  ApiGetMyShares,
  ApiGetShareDetail,
  ApiGetContent,
  ApiDownloadFile,
} from './external-share.swagger';

/**
 * 외부 사용자 파일 접근 컨트롤러
 */
@ApiTags('710.외부접근')
@Controller('v1/ext/shares')
@ApiBearerAuth()
@UseGuards(ExternalJwtAuthGuard)
export class ExternalShareController {
  constructor(
    private readonly accessService: ExternalShareAccessService,
  ) {}

  /**
   * 나에게 공유된 파일 목록
   */
  @Get()
  @ApiGetMyShares()
  async getMyShares(
    @ExternalUser() user: { id: string },
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const pagination: PaginationParams = { page, pageSize, sortBy, sortOrder };
    return this.accessService.getMyShares(user.id, pagination);
  }

  /**
   * 공유 상세 조회 + 콘텐츠 토큰 발급
   */
  @Get(':shareId')
  @ApiGetShareDetail()
  async getShareDetail(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
  ) {
    return this.accessService.getShareDetail(user.id, shareId);
  }

  /**
   * 파일 콘텐츠 (뷰어용)
   */
  @Get(':shareId/content')
  @ApiGetContent()
  async getContent(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Query('token') token: string,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
    @Res() res: Response,
  ) {
    const deviceType = this.detectDeviceType(userAgent);

    const result = await this.accessService.accessContent({
      externalUserId: user.id,
      shareId,
      token,
      action: AccessAction.VIEW,
      ipAddress,
      userAgent,
      deviceType,
    });

    // TODO: 실제 파일 스트리밍 구현 필요
    // FileDownloadService와 연동하여 파일 반환
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });

    return res.send({ success: result.success, fileId: result.share.fileId });
  }

  /**
   * 파일 다운로드
   */
  @Get(':shareId/download')
  @ApiDownloadFile()
  async downloadFile(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Query('token') token: string,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
    @Res() res: Response,
  ) {
    const deviceType = this.detectDeviceType(userAgent);

    const result = await this.accessService.accessContent({
      externalUserId: user.id,
      shareId,
      token,
      action: AccessAction.DOWNLOAD,
      ipAddress,
      userAgent,
      deviceType,
    });

    // TODO: 실제 파일 스트리밍 구현 필요
    // FileDownloadService와 연동하여 파일 반환
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });

    return res.send({ success: result.success, fileId: result.share.fileId });
  }

  /**
   * User-Agent에서 디바이스 타입 추출
   */
  private detectDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    return 'desktop';
  }
}
