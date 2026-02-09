import { Module } from '@nestjs/common';
import { ShareRequestDomainModule } from '../../domain/share-request/share-request.module';
import { ShareRequestInfraModule } from '../../infra/database/share-request-infra.module';
import { ExternalShareDomainModule } from '../../domain/external-share/external-share.module';
import { FileDomainModule } from '../../domain/file/file.module';
import { OrganizationModule } from '../../integrations/migration/organization/organization.module';
import { UserModule } from '../user/user.module';
import { ShareRequestCommandService } from './share-request-command.service';
import { ShareRequestQueryService } from './share-request-query.service';
import { ShareRequestValidationService } from './share-request-validation.service';

/**
 * ShareRequest Business 모듈
 *
 * 파일 공유 요청 시스템의 비즈니스 레이어
 * - ShareRequestCommandService: 명령 작업 (생성, 승인, 거부, 취소)
 * - ShareRequestQueryService: 조회 작업 (목록, 상세, 대상별, 파일별)
 * - ShareRequestValidationService: 검증 작업 (중복 확인, 파일/대상 검증)
 */
@Module({
  imports: [
    // Domain modules
    ShareRequestDomainModule,
    ExternalShareDomainModule,
    FileDomainModule,
    // Infra modules
    ShareRequestInfraModule,
    // Organization module (for Employee service)
    OrganizationModule,
    // User module (for UserService - 권한 확인)
    UserModule,
  ],
  providers: [
    ShareRequestCommandService,
    ShareRequestQueryService,
    ShareRequestValidationService,
  ],
  exports: [
    ShareRequestCommandService,
    ShareRequestQueryService,
    ShareRequestValidationService,
  ],
})
export class ShareRequestModule {}
