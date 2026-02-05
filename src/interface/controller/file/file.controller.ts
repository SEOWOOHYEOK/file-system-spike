import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FileQueryService, FileUploadService, FileDownloadService, FileManageService, SyncProgressService } from '../../../business/file';
import { SyncProgressResponseDto } from './dto/sync-progress-response.dto';
import {
  UploadFileResponse,
  FileInfoResponse,
  DeleteFileResponse,
  RenameFileRequest,
  RenameFileResponse,
  MoveFileRequest,
  MoveFileResponse,
  ConflictStrategy,
} from '../../../domain/file';
import {
  ApiFileUpload,
  ApiFilesUpload,
  ApiFileInfo,
  ApiFileDownload,
  ApiFileRename,
  ApiFileMove,
  ApiFileDelete,
  ApiFileSyncProgress,
} from './file.swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequestContext } from '../../../common/context/request-context';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import { createByteCountingStream, formatContentRange } from '../../../common/utils';

/**
 * 파일 컨트롤러
 * 파일 업로드, 다운로드, 조회, 관리 API
 * 
 * 인증: JWT Bearer 토큰 필수
 */
@ApiTags('200.파일')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/files')
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(
    private readonly fileQueryService: FileQueryService,
    private readonly fileUploadService: FileUploadService,
    private readonly fileDownloadService: FileDownloadService,
    private readonly fileManageService: FileManageService,
    private readonly syncProgressService: SyncProgressService,
  ) {}

  /**
   * POST /files/upload - 일반 파일 업로드 (100MB 미만)
   */
  @Post('upload')
  @ApiFileUpload()
  @UseInterceptors(FileInterceptor('file'))//muliti part form 파싱처리를 위해서 해당  인터셉터 를 사용
  @HttpCode(HttpStatus.CREATED)
  @AuditAction({
    action: AuditActionEnum.FILE_UPLOAD,
    targetType: TargetType.FILE,
    targetIdParam: 'id',
    targetNameParam: 'name',
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId', new ParseUUIDPipe()) folderId: string,
    @Body('conflictStrategy') conflictStrategy?: ConflictStrategy,
  ): Promise<UploadFileResponse> {
    return this.fileUploadService.upload({
      file,
      folderId,
      conflictStrategy,
    });
  }

  /**
   * POST /files/upload/many - 다중 파일 업로드
   */
  @Post('upload/many')
  @ApiFilesUpload()
  @UseInterceptors(FilesInterceptor('files'))
  @HttpCode(HttpStatus.CREATED)
  @AuditAction({
    action: AuditActionEnum.FILE_UPLOAD,
    targetType: TargetType.FOLDER,
    targetIdParam: 'folderId',
  })
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folderId', new ParseUUIDPipe()) folderId: string,
    @Body('conflictStrategy') conflictStrategy?: ConflictStrategy,
  ): Promise<UploadFileResponse[]> {
    return this.fileUploadService.uploadMany({
      files,
      folderId,
      conflictStrategy,
    });
  }

  /**
   * GET /files/:fileId - 파일 정보 조회
   */
  @Get(':fileId')
  @ApiFileInfo()
  // @AuditAction({
  //   action: AuditActionEnum.FILE_VIEW,
  //   targetType: TargetType.FILE,
  //   targetIdParam: 'fileId',
  // })
  async getFileInfo(@Param('fileId') fileId: string): Promise<FileInfoResponse> {
    return this.fileQueryService.getFileInfo(fileId);
  }

  /**
   * GET /files/:fileId/download - 파일 다운로드
   * 
   * HTTP Range Requests (RFC 7233) 지원
   * - Range 헤더 없음: 200 OK + 전체 파일
   * - Range 헤더 있음: 206 Partial Content + 부분 파일
   * - If-Range + ETag: 파일 변경 감지하여 이어받기 무결성 보장
   */
  @Get(':fileId/download')
  @ApiFileDownload()
  @AuditAction({
    action: AuditActionEnum.FILE_DOWNLOAD,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
  })
  async download(
    @Param('fileId') fileId: string,
    @Headers('range') rangeHeader: string,
    @Headers('if-range') ifRangeHeader: string,
    @Res() res: Response,
  ): Promise<void> {
    // 1. 다운로드 서비스 호출 (Range 파싱, If-Range 검증 모두 서비스에서 처리)
    const { file, storageObject, stream, isPartial, range, isRangeInvalid } =
      await this.fileDownloadService.downloadWithRange(fileId, {
        rangeHeader,
        ifRangeHeader,
      });

    // 2. Range 요청이 유효하지 않은 경우 (범위 초과 등)
    if (isRangeInvalid) {
      res.status(416); // Range Not Satisfiable
      res.set({
        'Content-Range': `bytes */${file.sizeBytes}`,
      });
      res.end();
      return;
    }

    // 3. 응답 헤더 설정
    const headers: Record<string, string | number> = {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Accept-Ranges': 'bytes', // Range 지원 표시
    };

    // ETag 헤더 (체크섬 기반) - 클라이언트가 이어받기/캐시에 활용
    if (storageObject.checksum) {
      headers['ETag'] = `"${storageObject.checksum}"`;
    }

    // Last-Modified 헤더
    headers['Last-Modified'] = file.updatedAt.toUTCString();

    // 체크섬 커스텀 헤더 (전체 파일에만 의미 있음)
    if (storageObject.checksum && !isPartial) {
      headers['X-Checksum-SHA256'] = storageObject.checksum;
    }

    if (isPartial && range) {
      // 206 Partial Content
      res.status(206);
      headers['Content-Range'] = formatContentRange(range.start, range.end, file.sizeBytes);
      headers['Content-Length'] = range.end - range.start + 1;
    } else {
      // 200 OK (전체 파일)
      headers['Content-Length'] = file.sizeBytes;
    }

    res.set(headers);

    // 4. 스트림 파이프
    if (stream) {
      // 중복 해제 방지 플래그
      let leaseReleased = false;
      const safeReleaseLease = async () => {
        if (leaseReleased) return;
        leaseReleased = true;
        await this.fileDownloadService.releaseLease(fileId);
      };

      // 바이트 카운팅 스트림 생성 및 파이프
      const expectedSize = isPartial && range ? range.end - range.start + 1 : file.sizeBytes;
      const rangeInfo = range ? `${range.start}-${range.end}` : 'full';
      const countingStream = createByteCountingStream(expectedSize, this.logger, fileId, rangeInfo);
      stream.pipe(countingStream).pipe(res);

      stream.on('end', safeReleaseLease);
      stream.on('error', safeReleaseLease);
      stream.on('close', safeReleaseLease);
    } else {
      // 스트림이 없으면 빈 응답
      res.end();
    }
  }

  /**
   * PUT /files/:fileId/rename - 파일명 변경
   */
  @Put(':fileId/rename')
  @ApiFileRename()
  @AuditAction({
    action: AuditActionEnum.FILE_RENAME,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
    targetNameParam: 'newName',
  })
  async rename(
    @Param('fileId') fileId: string,
    @Body() request: RenameFileRequest,
  ): Promise<RenameFileResponse> {
    const userId = RequestContext.getUserId() || 'unknown';
    return this.fileManageService.rename(fileId, request, userId);
  }

  /**
   * POST /files/:fileId/move - 파일 이동
   */
  @Post(':fileId/move')
  @ApiFileMove()
  @AuditAction({
    action: AuditActionEnum.FILE_MOVE,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
  })
  async move(
    @Param('fileId') fileId: string,
    @Body() request: MoveFileRequest,
  ): Promise<MoveFileResponse> {
    const userId = RequestContext.getUserId() || 'unknown';
    return this.fileManageService.move(fileId, request, userId);
  }

  /**
   * DELETE /files/:fileId - 파일 삭제 (휴지통 이동)
   * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
   * 응답: 200 OK (id, name, state=TRASHED, syncEventId)
   */
  @Delete(':fileId')
  @ApiFileDelete()
  @AuditAction({
    action: AuditActionEnum.FILE_DELETE,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
  })
  async delete(@Param('fileId') fileId: string): Promise<DeleteFileResponse> {
    const userId = RequestContext.getUserId() || 'unknown';
    return this.fileManageService.delete(fileId, userId);
  }

  /**
   * GET /files/sync-events/:syncEventId/progress - NAS 동기화 진행률 조회
   *
   * 클라이언트가 파일 업로드 후 NAS 동기화 진행률을 폴링하는 데 사용합니다.
   * 업로드 응답에 포함된 syncEventId를 사용하여 조회합니다.
   */
  @Get('sync-events/:syncEventId/progress')
  @ApiFileSyncProgress()
  async getSyncProgress(
    @Param('syncEventId', ParseUUIDPipe) syncEventId: string,
  ): Promise<SyncProgressResponseDto> {
    return this.syncProgressService.getProgress(syncEventId);
  }
}
