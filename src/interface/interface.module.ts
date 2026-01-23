import { Module } from '@nestjs/common';
import { FileController } from './controller/file/file.controller';
import { FolderController } from './controller/folder/folder.controller';
import { TrashController } from './trash/trash.controller';
import { BusinessModule } from '../business/business.module';

/**
 * 인터페이스 레이어 통합 모듈
 * 파일, 폴더, 휴지통 컨트롤러를 통합합니다.
 */
@Module({
  imports: [BusinessModule],
  controllers: [FileController, FolderController, TrashController],
})
export class InterfaceModule {}
