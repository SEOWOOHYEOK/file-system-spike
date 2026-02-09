import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ORM Entity
import { ShareRequestOrmEntity } from './entities/share-request.orm-entity';

// Repository
import { ShareRequestRepository } from './repositories/share-request.repository';

// Repository Token
import { SHARE_REQUEST_REPOSITORY } from '../../domain/share-request/repositories/share-request.repository.interface';

/**
 * ShareRequest Infrastructure 모듈
 *
 * 파일 공유 요청 시스템의 인프라 레이어
 * - TypeORM 엔티티 등록
 * - Repository 구현체 제공
 */
@Module({
  imports: [TypeOrmModule.forFeature([ShareRequestOrmEntity])],
  providers: [
    {
      provide: SHARE_REQUEST_REPOSITORY,
      useClass: ShareRequestRepository,
    },
  ],
  exports: [SHARE_REQUEST_REPOSITORY],
})
export class ShareRequestInfraModule {}
