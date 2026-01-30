import { Module, forwardRef } from '@nestjs/common';
import { ExternalShareInfraModule } from '../../infra/database/external-share-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { ExternalUserDomainService } from './service/external-user-domain.service';
import { PublicShareDomainService } from './service/public-share-domain.service';
import { ShareAccessLogDomainService } from './service/share-access-log-domain.service';

/**
 * ExternalShare 도메인 모듈
 *
 * 외부 파일 공유 시스템의 도메인 레이어
 * - ExternalUser: 외부 사용자 엔티티
 * - PublicShare: 외부 공유 엔티티
 * - ShareAccessLog: 접근 로그 엔티티
 */
@Module({
  imports: [
    // IPublicShareRepository 제공
    forwardRef(() => ExternalShareInfraModule),
    // IFileRepository 제공
    RepositoryModule,
  ],
  providers: [
    ExternalUserDomainService,
    PublicShareDomainService,
    ShareAccessLogDomainService,
  ],
  exports: [
    ExternalUserDomainService,
    PublicShareDomainService,
    ShareAccessLogDomainService,
  ],
})
export class ExternalShareDomainModule {}

