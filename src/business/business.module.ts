import { Module } from '@nestjs/common';
import { FileBusinessModule } from './file/file.module';
import { FolderBusinessModule } from './folder/folder.module';
import { TrashBusinessModule } from './trash/trash.module';
import { WorkerModule } from './worker/worker.module';

/**
 * 비즈니스 레이어 통합 모듈
 * 파일, 폴더, 휴지통 비즈니스 모듈을 통합합니다.
 */
@Module({
  imports: [
    FileBusinessModule,
    FolderBusinessModule,
    TrashBusinessModule,
    WorkerModule,
  ],
  exports: [
    FileBusinessModule,
    FolderBusinessModule,
    TrashBusinessModule,
    WorkerModule,
  ],
})
export class BusinessModule {}
