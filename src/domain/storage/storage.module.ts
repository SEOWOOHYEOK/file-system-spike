import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { FileCacheStorageDomainService } from './file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from './file/service/file-nas-storage-domain.service';
import { FolderNasStorageObjectDomainService } from './folder/service/folder-nas-storage-object-domain.service';
/**
 * 스토리지 도메인 모듈
 * 파일/폴더 스토리지 엔티티 및 포트를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [
    FileCacheStorageDomainService,
    FileNasStorageDomainService,
    FolderNasStorageObjectDomainService,
  ],
  exports: [
    FileCacheStorageDomainService,
    FileNasStorageDomainService,
    FolderNasStorageObjectDomainService,
  ],
})
export class StorageDomainModule {}
