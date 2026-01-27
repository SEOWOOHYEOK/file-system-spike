import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileShareOrmEntity } from './entities/file-share.orm-entity';
import { FileShareRepository } from './repositories/file-share.repository';
import { FILE_SHARE_REPOSITORY } from '../../domain/share/repositories/file-share.repository.interface';

/**
 * Share 인프라 모듈
 *
 * FileShare 영속성 관련 구현체 제공
 */
@Module({
  imports: [TypeOrmModule.forFeature([FileShareOrmEntity])],
  providers: [
    {
      provide: FILE_SHARE_REPOSITORY,
      useClass: FileShareRepository,
    },
  ],
  exports: [FILE_SHARE_REPOSITORY],
})
export class ShareInfraModule {}
