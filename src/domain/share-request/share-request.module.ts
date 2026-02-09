import { Module } from '@nestjs/common';
import { ShareRequestDomainService } from './service/share-request-domain.service';
import { ShareRequestInfraModule } from '../../infra/database/share-request-infra.module';

/**
 * ShareRequest 도메인 모듈
 *
 * 파일 공유 요청 시스템의 도메인 레이어
 * - ShareRequest: 파일 공유 요청 엔티티
 */
@Module({
  imports: [ShareRequestInfraModule],
  providers: [ShareRequestDomainService],
  exports: [ShareRequestDomainService],
})
export class ShareRequestDomainModule {}
