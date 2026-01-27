import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserOrmEntity } from './entities/user.orm-entity';
import { UserRepository } from './repositories/user.repository';
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository.interface';

/**
 * User 인프라 모듈
 *
 * User 영속성 관련 구현체 제공
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity])],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
  ],
  exports: [USER_REPOSITORY],
})
export class UserInfraModule {}
