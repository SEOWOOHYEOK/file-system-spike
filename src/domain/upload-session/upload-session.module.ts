/**
 * 업로드 세션 도메인 모듈
 */
import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { UploadSessionDomainService } from './service/upload-session-domain.service';

@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [UploadSessionDomainService],
  exports: [UploadSessionDomainService],
})
export class UploadSessionDomainModule {}
