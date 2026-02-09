import { Module } from '@nestjs/common';
import { ShareRequestDomainService } from './service/share-request-domain.service';

/**
 * ShareRequest 도메인 모듈
 *
 * 파일 공유 요청 시스템의 도메인 레이어
 * - ShareRequest: 파일 공유 요청 엔티티
 */
@Module({
  providers: [ShareRequestDomainService],
  exports: [ShareRequestDomainService],
})
export class ShareRequestDomainModule {}
