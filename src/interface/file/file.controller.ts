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
  UseInterceptors,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FileUploadService, FileDownloadService, FileManageService } from '../../business/file';
import {
  UploadFileResponse,
  FileInfoResponse,
  RenameFileRequest,
  RenameFileResponse,
  MoveFileRequest,
  MoveFileResponse,
  ConflictStrategy,
} from '../../domain/file';

/**
 * 파일 컨트롤러
 * 파일 업로드, 다운로드, 조회, 관리 API
 */
@Controller('files')
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
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId: string,
    @Body('conflictStrategy') conflictStrategy?: ConflictStrategy,
  ): Promise<UploadFileResponse> {
    return this.fileUploadService.upload({
      file,
      folderId,
      conflictStrategy,
    });
  }

  /**
   * GET /files/:fileId - 파일 정보 조회
   */
  @Get(':fileId')
  async getFileInfo(@Param('fileId') fileId: string): Promise<FileInfoResponse> {
    return this.fileDownloadService.getFileInfo(fileId);
  }

  /**
   * GET /files/:fileId/download - 파일 다운로드
   */
  @Get(':fileId/download')
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
    } else {
      // 임시: 스트림이 없으면 빈 응답
      res.end();
    }
  }

  /**
   * PUT /files/:fileId/rename - 파일명 변경
   */
  @Put(':fileId/rename')
  async rename(
    @Param('fileId') fileId: string,
    @Body() request: RenameFileRequest,
  ): Promise<RenameFileResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.fileManageService.rename(fileId, request, userId);
  }

  /**
   * POST /files/:fileId/move - 파일 이동
   */
  @Post(':fileId/move')
  async move(
    @Param('fileId') fileId: string,
    @Body() request: MoveFileRequest,
  ): Promise<MoveFileResponse> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.fileManageService.move(fileId, request, userId);
  }

  /**
   * DELETE /files/:fileId - 파일 삭제 (휴지통 이동)
   */
  @Delete(':fileId')
  async delete(@Param('fileId') fileId: string): Promise<{
    id: string;
    name: string;
    state: string;
    trashedAt: string;
  }> {
    // TODO: 실제 구현 시 인증된 사용자 ID 사용
    const userId = 'system';
    return this.fileManageService.delete(fileId, userId);
  }
}
