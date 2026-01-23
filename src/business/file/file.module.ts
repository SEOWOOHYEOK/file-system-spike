import { Module } from '@nestjs/common';
import { FileUploadService } from './file-upload.service';
import { FileDownloadService } from './file-download.service';
import { FileManageService } from './file-manage.service';

/**
 * 파일 비즈니스 모듈
 * 파일 업로드, 다운로드, 관리 서비스를 제공합니다.
 */
@Module({
  providers: [FileUploadService, FileDownloadService, FileManageService],
  exports: [FileUploadService, FileDownloadService, FileManageService],
})
export class FileBusinessModule {}
