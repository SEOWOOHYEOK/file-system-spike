import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { FolderNasStorageObjectDomainService } from '../../domain/storage/folder/service/folder-nas-storage-object-domain.service';

/**
 * 스토리지 비즈니스 모듈
 * 여러 도메인 조합이 필요한 스토리지 서비스를 제공합니다.
 */
@Module({
  imports: [RepositoryModule],
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
export class StorageBusinessModule {}
