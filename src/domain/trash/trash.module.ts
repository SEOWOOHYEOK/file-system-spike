import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { TrashDomainService } from './service/trash-domain.service';

/**
 * 휴지통 도메인 모듈
 * 휴지통 엔티티, DTO, 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [TrashDomainService],
  exports: [TrashDomainService],
})
export class TrashDomainModule {}
