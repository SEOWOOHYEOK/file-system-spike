/**
 * 데이터베이스 모듈
 * TypeORM을 사용하여 PostgreSQL 연결을 설정합니다.
 *
 * 환경변수:
 * - DB_HOST: 데이터베이스 호스트 (기본값: 'localhost')
 * - DB_PORT: 데이터베이스 포트 (기본값: 5432)
 * - DB_USERNAME: 데이터베이스 사용자 (기본값: 'postgres')
 * - DB_PASSWORD: 데이터베이스 비밀번호 (기본값: 'postgres')
 * - DB_DATABASE: 데이터베이스 이름 (기본값: 'dms')
 * - DB_SYNCHRONIZE: 스키마 자동 동기화 (기본값: false, 개발용으로만 true)
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';

// TypeORM Entities (forFeature 등록용)
import { FileOrmEntity } from './entities/file.orm-entity';
import { FolderOrmEntity } from './entities/folder.orm-entity';
import { TrashMetadataOrmEntity } from './entities/trash-metadata.orm-entity';
import { FileStorageObjectOrmEntity } from './entities/file-storage-object.orm-entity';
import { FolderStorageObjectOrmEntity } from './entities/folder-storage-object.orm-entity';
import { UploadSessionOrmEntity } from './entities/upload-session.orm-entity';
import { UploadPartOrmEntity } from './entities/upload-part.orm-entity';

// Audit Log Entities
import { AuditLogOrmEntity } from './entities/audit-log.orm-entity';
import { SecurityLogOrmEntity } from './entities/security-log.orm-entity';
import { FileHistoryOrmEntity } from './entities/file-history.orm-entity';

// Organization Entities (조직 관련 엔티티)
import {
  Rank,
  Position,
  Department,
  Employee,
  EmployeeDepartmentPosition,
  EmployeeDepartmentPositionHistory,
} from '../../integrations/migration/organization/entities';

/**
 * 등록된 모든 ORM 엔티티
 * 새 엔티티 추가 시 여기에만 추가하면 됩니다.
 */
const entities = [
  // File 관련 엔티티
  FileOrmEntity,
  FolderOrmEntity,
  TrashMetadataOrmEntity,
  FileStorageObjectOrmEntity,
  FolderStorageObjectOrmEntity,
  // Upload Session 관련 엔티티
  UploadSessionOrmEntity,
  UploadPartOrmEntity,
  // Audit Log 엔티티
  AuditLogOrmEntity,
  SecurityLogOrmEntity,
  FileHistoryOrmEntity,
  // Organization 관련 엔티티
  Rank,
  Position,
  Department,
  Employee,
  EmployeeDepartmentPosition,
  EmployeeDepartmentPositionHistory,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_DATABASE', 'dms'),
        // 방법 1: autoLoadEntities - forFeature로 등록된 엔티티 자동 로드
        autoLoadEntities: true,
        // 방법 2: 경로 패턴으로 엔티티 자동 검색 (주석 처리됨)
        // entities: [path.join(__dirname, 'entities', '*.orm-entity{.ts,.js}')],
        synchronize: configService.get<boolean>('DB_SYNCHRONIZE', true),
        logging: configService.get<string>('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
