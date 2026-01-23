import { Module } from '@nestjs/common';
import { FolderQueryService } from './folder-query.service';
import { FolderCommandService } from './folder-command.service';

/**
 * 폴더 비즈니스 모듈
 * 폴더 조회, 명령 서비스를 제공합니다.
 */
@Module({
  providers: [FolderQueryService, FolderCommandService],
  exports: [FolderQueryService, FolderCommandService],
})
export class FolderBusinessModule {}
