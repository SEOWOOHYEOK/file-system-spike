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
  UploadSessionOrmEntity,
  UploadPartOrmEntity,
  AuditLogOrmEntity,
  FileHistoryOrmEntity,
  SystemEventOrmEntity,
  UserOrmEntity,
  ErrorMessageOrmEntity,
} from './entities';

// Repository Implementations
import {
  FileRepository,
  FileStorageObjectRepository,
  FolderRepository,
  FolderStorageObjectRepository,
  TrashRepository,
  TrashQueryRepository,
  UploadSessionRepository,
  UploadPartRepository,
  AuditLogRepository,
  FileHistoryRepository,
  SystemEventRepository,
  UserRepository,
  ErrorMessageRepository,
} from './repositories';
import { SyncEventRepository } from './repositories/sync-event.repository';

// Repository Tokens (from domain layer)
import {
  FILE_REPOSITORY,
} from '../../domain/file/repositories/file.repository.interface';
import {
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage/file/repositories/file-storage-object.repository.interface';
import {
  FOLDER_REPOSITORY,
} from '../../domain/folder/repositories/folder.repository.interface';
import {
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';
import { TRASH_REPOSITORY, TRASH_QUERY_SERVICE } from '../../domain/trash/repositories/trash.repository.interface';
import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event';
import {
  UPLOAD_SESSION_REPOSITORY,
  UPLOAD_PART_REPOSITORY,
} from '../../domain/upload-session/repositories/upload-session.repository.interface';
import {
  AUDIT_LOG_REPOSITORY,
} from '../../domain/audit/repositories/audit-log.repository.interface';
import {
  FILE_HISTORY_REPOSITORY,
} from '../../domain/audit/repositories/file-history.repository.interface';
import {
  SYSTEM_EVENT_REPOSITORY,
} from '../../domain/audit/repositories/system-event.repository';
import {
  USER_REPOSITORY,
} from '../../domain/user/repositories/user.repository.interface';
import {
  FAVORITE_REPOSITORY,
} from '../../domain/favorite/repositories/favorite.repository.interface';
import { FavoriteOrmEntity } from './entities/favorite.orm-entity';
import { FavoriteRepository } from './repositories/favorite.repository';
import { SearchHistoryOrmEntity } from './entities/search-history.orm-entity';
import { SearchHistoryRepository } from './repositories/search-history.repository';
import {
  SEARCH_HISTORY_REPOSITORY,
} from '../../domain/search-history/repositories/search-history.repository.interface';
import { SystemConfigOrmEntity } from './entities/system-config.orm-entity';
import { NasHealthHistoryOrmEntity } from './entities/nas-health-history.orm-entity';
import { SystemConfigRepository } from './repositories/system-config.repository';
import { NasHealthHistoryRepository } from './repositories/nas-health-history.repository';
import {
  SYSTEM_CONFIG_REPOSITORY,
} from '../../domain/system-config/repositories/system-config.repository.interface';
import {
  NAS_HEALTH_HISTORY_REPOSITORY,
} from '../../domain/nas-health-history/repositories/nas-health-history.repository.interface';
import {
  ERROR_MESSAGE_REPOSITORY,
} from '../../domain/error-message/repositories/error-message.repository.interface';

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
  UploadSessionOrmEntity,
  UploadPartOrmEntity,
  AuditLogOrmEntity,
  FileHistoryOrmEntity,
  SystemEventOrmEntity,
  UserOrmEntity,
  FavoriteOrmEntity,
  SearchHistoryOrmEntity,
  SystemConfigOrmEntity,
  NasHealthHistoryOrmEntity,
  ErrorMessageOrmEntity,
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
    // Upload Session Repository
    {
      provide: UPLOAD_SESSION_REPOSITORY,
      useClass: UploadSessionRepository,
    },
    // Upload Part Repository
    {
      provide: UPLOAD_PART_REPOSITORY,
      useClass: UploadPartRepository,
    },
    // Audit Log Repository
    {
      provide: AUDIT_LOG_REPOSITORY,
      useClass: AuditLogRepository,
    },
    // File History Repository
    {
      provide: FILE_HISTORY_REPOSITORY,
      useClass: FileHistoryRepository,
    },
    // System Event Repository
    {
      provide: SYSTEM_EVENT_REPOSITORY,
      useClass: SystemEventRepository,
    },
    // User Repository
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
    // Favorite Repository
    {
      provide: FAVORITE_REPOSITORY,
      useClass: FavoriteRepository,
    },
    // Search History Repository
    {
      provide: SEARCH_HISTORY_REPOSITORY,
      useClass: SearchHistoryRepository,
    },
    // System Config Repository
    {
      provide: SYSTEM_CONFIG_REPOSITORY,
      useClass: SystemConfigRepository,
    },
    // NAS Health History Repository
    {
      provide: NAS_HEALTH_HISTORY_REPOSITORY,
      useClass: NasHealthHistoryRepository,
    },
    // Error Message Repository
    {
      provide: ERROR_MESSAGE_REPOSITORY,
      useClass: ErrorMessageRepository,
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
    UPLOAD_SESSION_REPOSITORY,
    UPLOAD_PART_REPOSITORY,
    AUDIT_LOG_REPOSITORY,
    FILE_HISTORY_REPOSITORY,
    SYSTEM_EVENT_REPOSITORY,
    USER_REPOSITORY,
    FAVORITE_REPOSITORY,
    SEARCH_HISTORY_REPOSITORY,
    SYSTEM_CONFIG_REPOSITORY,
    NAS_HEALTH_HISTORY_REPOSITORY,
    ERROR_MESSAGE_REPOSITORY,
  ],
})
export class RepositoryModule { }
