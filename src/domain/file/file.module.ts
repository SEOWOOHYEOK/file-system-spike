import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { FileDomainService } from './service/file-domain.service';

/**
 * 파일 도메인 모듈
 * 파일 엔티티, DTO, 값 객체, 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [FileDomainService],
  exports: [FileDomainService],
})
export class FileDomainModule {}
