import { Module } from '@nestjs/common';
import { FileDomainModule } from './file/file.module';
import { FolderDomainModule } from './folder/folder.module';
import { TrashDomainModule } from './trash/trash.module';

/**
 * 도메인 레이어 통합 모듈
 * 파일, 폴더, 휴지통, Admin 도메인 모듈을 통합합니다.
 */
@Module({
  imports: [FileDomainModule, FolderDomainModule, TrashDomainModule],
  exports: [FileDomainModule, FolderDomainModule, TrashDomainModule],
})
export class DomainModule {}
