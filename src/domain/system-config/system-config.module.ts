import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { SystemConfigDomainService } from './service/system-config-domain.service';

/**
 * 시스템 설정 도메인 모듈
 * 시스템 설정 엔티티, 도메인 서비스를 제공합니다.
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [SystemConfigDomainService],
  exports: [SystemConfigDomainService],
})
export class SystemConfigDomainModule {}
