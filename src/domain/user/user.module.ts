import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { UserDomainService } from './service/user-domain.service';

/**
 * User 도메인 모듈
 *
 * User 도메인 엔티티와 관련 추상화를 제공
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [UserDomainService],
  exports: [UserDomainService],
})
export class UserDomainModule {}
