import { Module } from '@nestjs/common';
import { ShareManagementService } from './share-management.service';
import { ShareAccessService } from './share-access.service';
import { ShareInfraModule } from '../../infra/database/share-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';

/**
 * Share 비즈니스 모듈
 *
 * 파일 공유 관련 비즈니스 로직 제공
 */
@Module({
  imports: [ShareInfraModule, RepositoryModule],
  providers: [ShareManagementService, ShareAccessService],
  exports: [ShareManagementService, ShareAccessService],
})
export class ShareModule {}
