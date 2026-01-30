import { Module, forwardRef } from '@nestjs/common';
import { RepositoryModule } from '../../infra/database/repository.module';
import { AuditLogDomainService } from './service/audit-log-domain.service';
import { SecurityLogDomainService } from './service/security-log-domain.service';
import { FileHistoryDomainService } from './service/file-history-domain.service';

/**
 * Audit 도메인 모듈
 *
 * 감사 로그, 보안 로그, 파일 이력 관련 도메인 로직
 */
@Module({
  imports: [forwardRef(() => RepositoryModule)],
  providers: [
    AuditLogDomainService,
    SecurityLogDomainService,
    FileHistoryDomainService,
  ],
  exports: [
    AuditLogDomainService,
    SecurityLogDomainService,
    FileHistoryDomainService,
  ],
})
export class AuditDomainModule {}
