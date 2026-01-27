/**
 * Repository 모듈
 * 도메인 리포지토리 인터페이스에 대한 TypeORM 구현체를 제공합니다.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './database.module';

// TypeORM ORM Entities
import {
  FileOrmEntity,
  FolderOrmEntity,
  TrashMetadataOrmEntity,
  FileStorageObjectOrmEntity,
  FolderStorageObjectOrmEntity,
  SyncEventOrmEntity,
} from './entities';

// Repository Implementations
import {
  FileRepository,
  FileStorageObjectRepository,
  FolderRepository,
  FolderStorageObjectRepository,
  TrashRepository,
  TrashQueryRepository,
} from './repositories';
import { SyncEventRepository } from './repositories/sync-event.repository';

// Repository Tokens (from domain layer)
import {
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/file/repositories/file.repository.interface';
import {
  FOLDER_REPOSITORY,
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/folder/repositories/folder.repository.interface';
import { TRASH_REPOSITORY, TRASH_QUERY_SERVICE } from '../../domain/trash/repositories/trash.repository.interface';
import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event';

/**
 * TypeORM forFeature에 등록할 엔티티 목록
 * @InjectRepository()가 동작하려면 여기에 등록 필요
 */
const entities = [
  FileOrmEntity,
  FolderOrmEntity,
  TrashMetadataOrmEntity,
  FileStorageObjectOrmEntity,
  FolderStorageObjectOrmEntity,
  SyncEventOrmEntity,
];

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature(entities),
  ],
  providers: [
    // File Repository
    {
      provide: FILE_REPOSITORY,
      useClass: FileRepository,
    },
    // File Storage Object Repository
    {
      provide: FILE_STORAGE_OBJECT_REPOSITORY,
      useClass: FileStorageObjectRepository,
    },
    // Folder Repository
    {
      provide: FOLDER_REPOSITORY,
      useClass: FolderRepository,
    },
    // Folder Storage Object Repository
    {
      provide: FOLDER_STORAGE_OBJECT_REPOSITORY,
      useClass: FolderStorageObjectRepository,
    },
    // Trash Repository
    {
      provide: TRASH_REPOSITORY,
      useClass: TrashRepository,
    },
    // Trash Query Service
    {
      provide: TRASH_QUERY_SERVICE,
      useClass: TrashQueryRepository,
    },
    // Sync Event Repository
    {
      provide: SYNC_EVENT_REPOSITORY,
      useClass: SyncEventRepository,
    },
  ],
  exports: [
    FILE_REPOSITORY,
    FILE_STORAGE_OBJECT_REPOSITORY,
    FOLDER_REPOSITORY,
    FOLDER_STORAGE_OBJECT_REPOSITORY,
    TRASH_REPOSITORY,
    TRASH_QUERY_SERVICE,
    SYNC_EVENT_REPOSITORY,
  ],
})
export class RepositoryModule {}
