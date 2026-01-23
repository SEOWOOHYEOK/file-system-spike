import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { FolderDomainService } from './service/folder-domain.service';

/**
 * 폴더 도메인 모듈
 * 폴더 엔티티, DTO, 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [FolderDomainService],
  exports: [FolderDomainService],
})
export class FolderDomainModule {}
