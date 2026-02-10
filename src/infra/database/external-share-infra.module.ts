import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ORM Entities
import { PublicShareOrmEntity } from './entities/public-share.orm-entity';
import { ShareAccessLogOrmEntity } from './entities/share-access-log.orm-entity';

// Repositories
import { PublicShareRepository } from './repositories/public-share.repository';
import { ShareAccessLogRepository } from './repositories/share-access-log.repository';

// Repository Tokens
import { PUBLIC_SHARE_REPOSITORY } from '../../domain/external-share/repositories/public-share.repository.interface';
import { SHARE_ACCESS_LOG_REPOSITORY } from '../../domain/external-share/repositories/share-access-log.repository.interface';

/**
 * ExternalShare Infrastructure 모듈
 *
 * 외부 파일 공유 시스템의 인프라 레이어
 * - TypeORM 엔티티 등록 (PublicShare, ShareAccessLog)
 * - Repository 구현체 제공
 * - ExternalUser: Employee 기반으로 마이그레이션됨 (별도 테이블 없음)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PublicShareOrmEntity,
      ShareAccessLogOrmEntity,
    ]),
  ],
  providers: [
    {
      provide: PUBLIC_SHARE_REPOSITORY,
      useClass: PublicShareRepository,
    },
    {
      provide: SHARE_ACCESS_LOG_REPOSITORY,
      useClass: ShareAccessLogRepository,
    },
  ],
  exports: [
    PUBLIC_SHARE_REPOSITORY,
    SHARE_ACCESS_LOG_REPOSITORY,
  ],
})
export class ExternalShareInfraModule {}
