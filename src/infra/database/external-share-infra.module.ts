import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ORM Entities
import { ExternalUserOrmEntity } from './entities/external-user.orm-entity';
import { PublicShareOrmEntity } from './entities/public-share.orm-entity';
import { ShareAccessLogOrmEntity } from './entities/share-access-log.orm-entity';

// Repositories
import { ExternalUserRepository } from './repositories/external-user.repository';
import { PublicShareRepository } from './repositories/public-share.repository';
import { ShareAccessLogRepository } from './repositories/share-access-log.repository';

// Repository Tokens
import { EXTERNAL_USER_REPOSITORY } from '../../domain/external-share/repositories/external-user.repository.interface';
import { PUBLIC_SHARE_REPOSITORY } from '../../domain/external-share/repositories/public-share.repository.interface';
import { SHARE_ACCESS_LOG_REPOSITORY } from '../../domain/external-share/repositories/share-access-log.repository.interface';

/**
 * ExternalShare Infrastructure 모듈
 *
 * 외부 파일 공유 시스템의 인프라 레이어
 * - TypeORM 엔티티 등록
 * - Repository 구현체 제공
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExternalUserOrmEntity,
      PublicShareOrmEntity,
      ShareAccessLogOrmEntity,
    ]),
  ],
  providers: [
    {
      provide: EXTERNAL_USER_REPOSITORY,
      useClass: ExternalUserRepository,
    },
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
    EXTERNAL_USER_REPOSITORY,
    PUBLIC_SHARE_REPOSITORY,
    SHARE_ACCESS_LOG_REPOSITORY,
  ],
})
export class ExternalShareInfraModule {}
