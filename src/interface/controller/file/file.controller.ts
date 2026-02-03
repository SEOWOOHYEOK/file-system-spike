import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FileUploadService, FileDownloadService, FileManageService } from '../../../business/file';
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
} from './file.swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequestContext } from '../../../common/context/request-context';
import { AuditAction } from '../../../common/decorators';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType } from '../../../domain/audit/enums/common.enum';

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
  constructor(
    private readonly fileUploadService: FileUploadService,
    private readonly fileDownloadService: FileDownloadService,
    private readonly fileManageService: FileManageService,
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
    return this.fileDownloadService.getFileInfo(fileId);
  }

  /**
   * GET /files/:fileId/download - 파일 다운로드
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
    @Res() res: Response,
  ): Promise<void> {
    const { file, stream } = await this.fileDownloadService.download(fileId);

    // 응답 헤더 설정
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Content-Length': file.sizeBytes,
    });

    // 스트림 파이프 (실제 구현 시)
    if (stream) {
      stream.pipe(res);
      stream.on('end', async () => {
        await this.fileDownloadService.releaseLease(fileId);
      });
      stream.on('error', async () => {
        await this.fileDownloadService.releaseLease(fileId);
      });
      stream.on('close', async () => {
        await this.fileDownloadService.releaseLease(fileId);
      });
    } else {
      // 임시: 스트림이 없으면 빈 응답
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
   *
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
}
