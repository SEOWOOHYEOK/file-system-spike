import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { SecurityLogService } from './security-log.service';
import { FileHistoryService } from './file-history.service';
import { AuditLogHelper } from './audit-log-helper.service';
import { AuditLogOrmEntity } from '../../infra/database/entities/audit-log.orm-entity';
import { SecurityLogOrmEntity } from '../../infra/database/entities/security-log.orm-entity';
import { FileHistoryOrmEntity } from '../../infra/database/entities/file-history.orm-entity';
import { AuditLogRepository } from '../../infra/database/repositories/audit-log.repository';
import { SecurityLogRepository } from '../../infra/database/repositories/security-log.repository';
import { FileHistoryRepository } from '../../infra/database/repositories/file-history.repository';
import { AUDIT_LOG_REPOSITORY } from '../../domain/audit/repositories/audit-log.repository.interface';
import { SECURITY_LOG_REPOSITORY } from '../../domain/audit/repositories/security-log.repository.interface';
import { FILE_HISTORY_REPOSITORY } from '../../domain/audit/repositories/file-history.repository.interface';

/**
 * Audit 비즈니스 모듈
 *
 * 감사 로그, 보안 로그, 파일 이력 서비스 제공
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditLogOrmEntity,
      SecurityLogOrmEntity,
      FileHistoryOrmEntity,
    ]),
  ],
  providers: [
    // Services
    AuditLogService,
    SecurityLogService,
    FileHistoryService,
    AuditLogHelper,
    // Repositories
    {
      provide: AUDIT_LOG_REPOSITORY,
      useClass: AuditLogRepository,
    },
    {
      provide: SECURITY_LOG_REPOSITORY,
      useClass: SecurityLogRepository,
    },
    {
      provide: FILE_HISTORY_REPOSITORY,
      useClass: FileHistoryRepository,
    },
  ],
  exports: [
    AuditLogService,
    SecurityLogService,
    FileHistoryService,
    AuditLogHelper,
  ],
})
export class AuditModule {}
