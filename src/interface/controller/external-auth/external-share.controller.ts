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
  Logger,
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
import { createByteCountingStream, formatContentRange } from '../../../common/utils';

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
  private readonly logger = new Logger(ExternalShareController.name);

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
   * HTTP Range Requests (RFC 7233) 지원
   * - If-Range + ETag: 파일 변경 감지하여 이어받기 무결성 보장
   */
  @Get(':shareId/content')
  @ApiGetContent()
  async getContent(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Query() tokenQuery: ContentTokenQueryDto,
    @Headers('user-agent') userAgent: string,
    @Headers('range') rangeHeader: string,
    @Headers('if-range') ifRangeHeader: string,
    @Ip() ipAddress: string,
    @Res() res: Response,
  ): Promise<void> {
    const deviceType = this.detectDeviceType(userAgent);

    // 1. 접근 검증 + 파일 다운로드 (Range/If-Range 서비스에서 처리)
    const result = await this.accessService.accessContent({
      externalUserId: user.id,
      shareId,
      token: tokenQuery.token,
      action: AccessAction.VIEW,
      ipAddress,
      userAgent,
      deviceType,
      rangeHeader,
      ifRangeHeader,
    });

    const { file, storageObject, stream, isPartial, range, isRangeInvalid } = result;

    // 2. Range 요청이 유효하지 않은 경우 (416 Range Not Satisfiable)
    if (isRangeInvalid) {
      res.status(416);
      res.set({ 'Content-Range': `bytes */${file.sizeBytes}` });
      res.end();
      return;
    }

    // 응답 헤더 설정 (inline - 뷰어 표시용)
    const contentHeaders: Record<string, string | number> = {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };

    // ETag 헤더 (체크섬 기반)
    if (storageObject.checksum) {
      contentHeaders['ETag'] = `"${storageObject.checksum}"`;
    }

    // Last-Modified 헤더
    contentHeaders['Last-Modified'] = file.updatedAt.toUTCString();

    // 체크섬 커스텀 헤더 (전체 파일에만 의미 있음)
    if (storageObject.checksum && !isPartial && !range) {
      contentHeaders['X-Checksum-SHA256'] = storageObject.checksum;
    }

    if (isPartial && range) {
      // 206 Partial Content
      res.status(206);
      contentHeaders['Content-Range'] = formatContentRange(range.start, range.end, file.sizeBytes);
      contentHeaders['Content-Length'] = range.end - range.start + 1;
    } else {
      // 200 OK (전체 파일)
      contentHeaders['Content-Length'] = file.sizeBytes;
    }

    res.set(contentHeaders);

    // 스트림 파이프
    if (stream) {
      // 중복 해제 방지 플래그
      let leaseReleased = false;
      const safeReleaseLease = async () => {
        if (leaseReleased) return;
        leaseReleased = true;
        await this.accessService.releaseLease(file.id);
      };

      // 바이트 카운팅 스트림 생성 및 파이프
      const expectedSize = isPartial && range ? range.end - range.start + 1 : file.sizeBytes;
      const countingStream = createByteCountingStream(expectedSize, this.logger, file.id);
      stream.pipe(countingStream).pipe(res);

      stream.on('end', safeReleaseLease);
      stream.on('error', safeReleaseLease);
      stream.on('close', safeReleaseLease);
    } else {
      // 스트림이 없는 경우 빈 응답
      res.end();
    }
  }

  /**
   * 파일 다운로드
   *
   * attachment Content-Disposition으로 파일 다운로드
   * HTTP Range Requests (RFC 7233) 지원
   * - If-Range + ETag: 파일 변경 감지하여 이어받기 무결성 보장
   */
  @Get(':shareId/download')
  @ApiDownloadFile()
  async downloadFile(
    @ExternalUser() user: { id: string },
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Query() tokenQuery: ContentTokenQueryDto,
    @Headers('user-agent') userAgent: string,
    @Headers('range') rangeHeader: string,
    @Headers('if-range') ifRangeHeader: string,
    @Ip() ipAddress: string,
    @Res() res: Response,
  ): Promise<void> {
    const deviceType = this.detectDeviceType(userAgent);

    // 1. 접근 검증 + 파일 다운로드 (Range/If-Range 서비스에서 처리)
    const result = await this.accessService.accessContent({
      externalUserId: user.id,
      shareId,
      token: tokenQuery.token,
      action: AccessAction.DOWNLOAD,
      ipAddress,
      userAgent,
      deviceType,
      rangeHeader,
      ifRangeHeader,
    });

    const { file, storageObject, stream, isPartial, range, isRangeInvalid } = result;

    // 2. Range 요청이 유효하지 않은 경우 (416 Range Not Satisfiable)
    if (isRangeInvalid) {
      res.status(416);
      res.set({ 'Content-Range': `bytes */${file.sizeBytes}` });
      res.end();
      return;
    }

    // 응답 헤더 설정 (attachment - 다운로드용)
    const downloadHeaders: Record<string, string | number> = {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };

    // ETag 헤더 (체크섬 기반)
    if (storageObject.checksum) {
      downloadHeaders['ETag'] = `"${storageObject.checksum}"`;
    }

    // Last-Modified 헤더
    downloadHeaders['Last-Modified'] = file.updatedAt.toUTCString();

    // 체크섬 커스텀 헤더 (전체 파일에만 의미 있음)
    if (storageObject.checksum && !isPartial && !range) {
      downloadHeaders['X-Checksum-SHA256'] = storageObject.checksum;
    }

    if (isPartial && range) {
      // 206 Partial Content
      res.status(206);
      downloadHeaders['Content-Range'] = formatContentRange(range.start, range.end, file.sizeBytes);
      downloadHeaders['Content-Length'] = range.end - range.start + 1;
    } else {
      // 200 OK (전체 파일)
      downloadHeaders['Content-Length'] = file.sizeBytes;
    }

    res.set(downloadHeaders);

    // 스트림 파이프
    if (stream) {
      // 중복 해제 방지 플래그
      let leaseReleased = false;
      const safeReleaseLease = async () => {
        if (leaseReleased) return;
        leaseReleased = true;
        await this.accessService.releaseLease(file.id);
      };

      // 바이트 카운팅 스트림 생성 및 파이프
      const expectedSize = isPartial && range ? range.end - range.start + 1 : file.sizeBytes;
      const countingStream = createByteCountingStream(expectedSize, this.logger, file.id);
      stream.pipe(countingStream).pipe(res);

      stream.on('end', safeReleaseLease);
      stream.on('error', safeReleaseLease);
      stream.on('close', safeReleaseLease);
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
