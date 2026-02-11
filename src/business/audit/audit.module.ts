import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { FileHistoryService } from './file-history.service';
import { SystemEventService } from './system-event.service';
import { UnifiedTimelineService } from './unified-timeline.service';
import { AuditDomainModule } from '../../domain/audit/audit.module';

/**
 * Audit 비즈니스 모듈
 *
 * 감사 로그, 파일 이력 서비스 제공
 */
@Module({
  imports: [
    AuditDomainModule,
  ],
  providers: [
    // Services
    AuditLogService,
    FileHistoryService,
    SystemEventService,
    
    UnifiedTimelineService,
  ],
  exports: [
    AuditLogService,
    FileHistoryService,
    SystemEventService,
    
    UnifiedTimelineService,
  ],
})
export class AuditModule {}
