import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileActionRequestOrmEntity } from './entities/file-action-request.orm-entity';
import { FileActionRequestRepository } from './repositories/file-action-request.repository';
import { FILE_ACTION_REQUEST_REPOSITORY } from '../../domain/file-action-request/repositories/file-action-request.repository.interface';

@Module({
  imports: [TypeOrmModule.forFeature([FileActionRequestOrmEntity])],
  providers: [
    {
      provide: FILE_ACTION_REQUEST_REPOSITORY,
      useClass: FileActionRequestRepository,
    },
  ],
  exports: [FILE_ACTION_REQUEST_REPOSITORY],
})
export class FileActionRequestInfraModule {}
