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
import type { PaginationParams } from '../../../common/types/pagination';
import { AccessAction } from '../../../domain/external-share/entities/share-access-log.entity';
import { ExternalUser } from '../../../common/decorators/external-user.decorator';
import {
  ApiGetMyShares,
  ApiGetShareDetail,
  ApiGetContent,
  ApiDownloadFile,
} from './external-share.swagger';
import {
  ContentTokenQueryDto,
  MyShareListItemDto,
  ShareDetailResponseDto,
} from './dto/external-share-access.dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../../common/dto';

/**
 * 외부 사용자 파일 접근 컨트롤러
 *
 * 외부 사용자가 공유받은 파일에 접근하기 위한 API
 * - VIEW: 뷰어에서 파일 콘텐츠 표시 (inline)
 * - DOWNLOAD: 파일 다운로드 (attachment)
 *
 * 비즈니스 로직 (접근 검증 + 파일 다운로드)은 ExternalShareAccessService에서 처리
 */
@ApiTags('710.외부접근')
@Controller('v1/ext/shares')
@ApiBearerAuth()
@UseGuards(ExternalJwtAuthGuard)
export class ExternalShareController {
  constructor(private readonly accessService: ExternalShareAccessService) {}

  /**
   * 나에게 공유된 파일 목록
   */
  @Get()
  @ApiGetMyShares()
  async getMyShares(
    @ExternalUser() user: { id: string },
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<MyShareListItemDto>> {
    const pagination: PaginationParams = {
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    const result = await this.accessService.getMyShares(user.id, pagination);
    return result;
  }

  /**
   * 공유 상세 조회 + 콘텐츠 토큰 발급
   */
  @Get(':shareId')
  @ApiGetShareDetail()
  async getShareDetail(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
  ): Promise<ShareDetailResponseDto> {
    const result = await this.accessService.getShareDetail(user.id, shareId);
    return ShareDetailResponseDto.fromResult(result);
  }

  /**
   * 파일 콘텐츠 (뷰어용)
   *
   * inline Content-Disposition으로 브라우저 뷰어에서 파일 표시
   */
  @Get(':shareId/content')
  @ApiGetContent()
  async getContent(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Query() tokenQuery: ContentTokenQueryDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
    @Res() res: Response,
  ): Promise<void> {
    const deviceType = this.detectDeviceType(userAgent);

    // 접근 검증 + 파일 다운로드 (서비스에서 통합 처리)
    const result = await this.accessService.accessContent({
      externalUserId: user.id,
      shareId,
      token: tokenQuery.token,
      action: AccessAction.VIEW,
      ipAddress,
      userAgent,
      deviceType,
    });

    const { file, stream } = result;

    // 응답 헤더 설정 (inline - 뷰어 표시용)
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Content-Length': file.sizeBytes,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });

    // 스트림 파이프
    if (stream) {
      stream.pipe(res);

      // 스트림 종료 시 lease 해제
      const releaseLease = async () => {
        await this.accessService.releaseLease(file.id);
      };

      stream.on('end', releaseLease);
      stream.on('error', releaseLease);
      stream.on('close', releaseLease);
    } else {
      // 스트림이 없는 경우 빈 응답
      res.end();
    }
  }

  /**
   * 파일 다운로드
   *
   * attachment Content-Disposition으로 파일 다운로드
   */
  @Get(':shareId/download')
  @ApiDownloadFile()
  async downloadFile(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Query() tokenQuery: ContentTokenQueryDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
    @Res() res: Response,
  ): Promise<void> {
    const deviceType = this.detectDeviceType(userAgent);

    // 접근 검증 + 파일 다운로드 (서비스에서 통합 처리)
    const result = await this.accessService.accessContent({
      externalUserId: user.id,
      shareId,
      token: tokenQuery.token,
      action: AccessAction.DOWNLOAD,
      ipAddress,
      userAgent,
      deviceType,
    });

    const { file, stream } = result;

    // 응답 헤더 설정 (attachment - 다운로드용)
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Content-Length': file.sizeBytes,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });

    // 스트림 파이프
    if (stream) {
      stream.pipe(res);

      // 스트림 종료 시 lease 해제
      const releaseLease = async () => {
        await this.accessService.releaseLease(file.id);
      };

      stream.on('end', releaseLease);
      stream.on('error', releaseLease);
      stream.on('close', releaseLease);
    } else {
      // 스트림이 없는 경우 빈 응답
      res.end();
    }
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
