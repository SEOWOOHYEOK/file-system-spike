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
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { FileQueryService, FileUploadService, FileDownloadService, FileManageService, SyncProgressService } from '../../../business/file';
import { SyncEventQueryService, FileSyncStatusResponse } from '../../../business/sync-event';
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
  ApiFilePreview,
  ApiFileRename,
  ApiFileMove,
  ApiFileDelete,
  ApiFileSyncStatus,
  ApiFileSyncProgress,
} from './file.swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NasAvailabilityGuard } from '../../../common/guards/nas-availability.guard';
import { PermissionsGuard } from '../../../business/role/guards/permissions.guard';
import { RequirePermissions } from '../../../business/role/decorators/require-permissions.decorator';
import { PermissionEnum } from '../../../domain/role/permission.enum';
import { RequestContext } from '../../../common/context/request-context';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';
import {
  extractUploadMetadata,
  extractDownloadMetadata,
  extractRenameMetadata,
  extractMoveMetadata,
  extractDeleteMetadata,
} from '../../../common/interceptors/audit-metadata-extractors';
// createByteCountingStream, formatContentRange → FileDownloadService.prepareDownload()로 이동

/**
 * 파일 컨트롤러
 * 파일 업로드, 다운로드, 조회, 관리 API
 * 
 * 인증: JWT Bearer 토큰 필수
 */
@ApiTags('200.파일')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard, NasAvailabilityGuard)
@RequirePermissions(PermissionEnum.FILE_READ)
@Controller('v1/files')
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(
    private readonly fileQueryService: FileQueryService,
    private readonly fileUploadService: FileUploadService,
    private readonly fileDownloadService: FileDownloadService,
    private readonly fileManageService: FileManageService,
    private readonly syncProgressService: SyncProgressService,
    private readonly syncEventQueryService: SyncEventQueryService,
  ) {}

  /**
   * POST /files/upload - 일반 파일 업로드 (100MB 미만)
   */
  @Post('upload')
  @RequirePermissions(PermissionEnum.FILE_UPLOAD)
  @ApiFileUpload()
  @UseInterceptors(FileInterceptor('file'))//muliti part form 파싱처리를 위해서 해당  인터셉터 를 사용
  @HttpCode(HttpStatus.CREATED)
  @AuditAction({
    action: AuditActionEnum.FILE_UPLOAD,
    targetType: TargetType.FILE,
    targetIdParam: 'id',
    targetNameParam: 'name',
    extractMetadata: extractUploadMetadata,
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId', new ParseUUIDPipe()) folderId: string,
    @Body('conflictStrategy') conflictStrategy?: ConflictStrategy,
  ): Promise<UploadFileResponse> {
    this.logger.log(
      `파일 업로드 요청: fileName=${file?.originalname}, folderId=${folderId}, size=${file?.size}, userId=${RequestContext.getUserId()}`,
    );
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
  @RequirePermissions(PermissionEnum.FILE_UPLOAD)
  @ApiFilesUpload()
  @UseInterceptors(FilesInterceptor('files'))
  @HttpCode(HttpStatus.CREATED)
  @AuditAction({
    action: AuditActionEnum.FILE_UPLOAD,
    targetType: TargetType.FILE,
    targetIdParam: 'id',
    targetNameParam: 'name',
    perItem: true,
    extractItemMetadata: extractUploadMetadata,
  })
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folderId', new ParseUUIDPipe()) folderId: string,
    @Body('conflictStrategy') conflictStrategy?: ConflictStrategy,
  ): Promise<UploadFileResponse[]> {
    this.logger.log(
      `다중 파일 업로드 요청: fileCount=${files?.length}, folderId=${folderId}, userId=${RequestContext.getUserId()}`,
    );
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
  @RequirePermissions(PermissionEnum.FILE_DOWNLOAD)
  @ApiFileDownload()
  @AuditAction({
    action: AuditActionEnum.FILE_DOWNLOAD,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
    extractMetadata: extractDownloadMetadata,
  })
  async download(
    @Param('fileId') fileId: string,
    @Headers('range') rangeHeader: string,
    @Headers('if-range') ifRangeHeader: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `파일 다운로드 요청: fileId=${fileId}, hasRange=${!!rangeHeader}, userId=${RequestContext.getUserId()}`,
    );

    // 1. 서비스에서 상태코드·헤더·스트림 조합 (헤더 조합, 바이트 카운팅 래핑 포함)
    const { statusCode, headers, stream, fileInfo } =
      await this.fileDownloadService.prepareDownload(fileId, {
        rangeHeader,
        ifRangeHeader,
      });

    // 감사 로그용 파일 메타데이터를 request에 저장
    (req as any).__auditFileInfo = fileInfo;

    // 2. HTTP 응답 전송
    res.status(statusCode);
    res.set(headers);

    if (!stream) {
      res.end();
      return;
    }

    // 3. 스트림 → 응답 파이프 + lease 해제
    let leaseReleased = false;
    const safeReleaseLease = async () => {
      if (leaseReleased) return;
      leaseReleased = true;
      await this.fileDownloadService.releaseLease(fileId);
    };

    stream.pipe(res);
    stream.on('end', safeReleaseLease);
    stream.on('error', safeReleaseLease);
    stream.on('close', safeReleaseLease);
  }

  /**
   * GET /files/:fileId/preview - 파일 미리보기 (인라인 표시)
   *
   * 브라우저가 파일을 직접 렌더링할 수 있도록 Content-Disposition: inline 으로 응답.
   * 이미지, PDF, 비디오, 오디오, 텍스트 등 브라우저가 지원하는 파일 타입은 즉시 표시되고,
   * 미지원 타입은 자동으로 다운로드됩니다.
   *
   * 클라이언트 사용:
   *   <img src="/v1/files/{fileId}/preview" />
   *   <iframe src="/v1/files/{fileId}/preview" />
   *   <video src="/v1/files/{fileId}/preview" controls />
   *   <audio src="/v1/files/{fileId}/preview" controls />
   */
  @Get(':fileId/preview')
  @RequirePermissions(PermissionEnum.FILE_DOWNLOAD)
  @ApiFilePreview()
  @AuditAction({
    action: AuditActionEnum.FILE_VIEW,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
    extractMetadata: extractDownloadMetadata,
  })
  async preview(
    @Param('fileId') fileId: string,
    @Headers('range') rangeHeader: string,
    @Headers('if-range') ifRangeHeader: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `파일 미리보기 요청: fileId=${fileId}, hasRange=${!!rangeHeader}, userId=${RequestContext.getUserId()}`,
    );

    const { statusCode, headers, stream, fileInfo } =
      await this.fileDownloadService.preparePreview(fileId, {
        rangeHeader,
        ifRangeHeader,
      });

    // 감사 로그용 파일 메타데이터를 request에 저장
    (req as any).__auditFileInfo = fileInfo;

    res.status(statusCode);
    res.set(headers);

    if (!stream) {
      res.end();
      return;
    }

    let leaseReleased = false;
    const safeReleaseLease = async () => {
      if (leaseReleased) return;
      leaseReleased = true;
      await this.fileDownloadService.releaseLease(fileId);
    };

    stream.pipe(res);
    stream.on('end', safeReleaseLease);
    stream.on('error', safeReleaseLease);
    stream.on('close', safeReleaseLease);
  }

  /**
   * PUT /files/:fileId/rename - 파일명 변경
   */
  @Put(':fileId/rename')
  @RequirePermissions(PermissionEnum.FILE_WRITE)
  @ApiFileRename()
  @AuditAction({
    action: AuditActionEnum.FILE_RENAME,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
    targetNameParam: 'newName',
    extractMetadata: extractRenameMetadata,
  })
  async rename(
    @Param('fileId') fileId: string,
    @Body() request: RenameFileRequest,
  ): Promise<RenameFileResponse> {
    const userId = RequestContext.getUserId() || 'unknown';
    this.logger.log(
      `파일 이름변경 요청: fileId=${fileId}, newName=${request.newName}, userId=${userId}`,
    );
    return this.fileManageService.rename(fileId, request, userId);
  }


  /**
   * POST /files/:fileId/move - 파일 이동
   */
  @Post(':fileId/move')
  @RequirePermissions(PermissionEnum.FILE_MOVE)
  @ApiFileMove()
  @AuditAction({
    action: AuditActionEnum.FILE_MOVE,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
    extractMetadata: extractMoveMetadata,
  })
  async move(
    @Param('fileId') fileId: string,
    @Body() request: MoveFileRequest,
  ): Promise<MoveFileResponse> {
    const userId = RequestContext.getUserId() || 'unknown';
    this.logger.log(
      `파일 이동 요청: fileId=${fileId}, targetFolderId=${request.targetFolderId}, userId=${userId}`,
    );
    return this.fileManageService.move(fileId, request, userId);
  }

  /**
   * DELETE /files/:fileId - 파일 삭제 (휴지통 이동)
   * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
   * 응답: 200 OK (id, name, state=TRASHED, syncEventId)
   */
  @Delete(':fileId')
  @RequirePermissions(PermissionEnum.FILE_DELETE)
  @ApiFileDelete()
  @AuditAction({
    action: AuditActionEnum.FILE_DELETE,
    targetType: TargetType.FILE,
    targetIdParam: 'fileId',
    extractMetadata: extractDeleteMetadata,
  })
  async delete(@Param('fileId') fileId: string): Promise<DeleteFileResponse> {
    const userId = RequestContext.getUserId() || 'unknown';
    this.logger.log(
      `파일 삭제(휴지통 이동) 요청: fileId=${fileId}, userId=${userId}`,
    );
    return this.fileManageService.delete(fileId, userId);
  }

  /**
   * GET /files/:fileId/sync-status - 파일 동기화 상태 조회
   */
  @Get(':fileId/sync-status')
  @ApiFileSyncStatus()
  async getFileSyncStatus(
    @Param('fileId') fileId: string,
  ): Promise<FileSyncStatusResponse> {
    return this.syncEventQueryService.getFileSyncStatus(fileId);
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
