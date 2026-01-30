import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { SecurityLogService } from './security-log.service';
import { FileHistoryService } from './file-history.service';
import { AuditLogHelper } from './audit-log-helper.service';
import { AuditDomainModule } from '../../domain/audit/audit.module';

/**
 * Audit 비즈니스 모듈
 *
 * 감사 로그, 보안 로그, 파일 이력 서비스 제공
 */
@Module({
  imports: [
    AuditDomainModule,
  ],
  providers: [
    // Services
    AuditLogService,
    SecurityLogService,
    FileHistoryService,
    AuditLogHelper,
  ],
  exports: [
    AuditLogService,
    SecurityLogService,
    FileHistoryService,
    AuditLogHelper,
  ],
})
export class AuditModule {}
