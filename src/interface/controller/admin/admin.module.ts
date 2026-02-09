import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Admin 컨트롤러
import { AdminController } from './admin.controller';
import { AuditLogController } from './audit-log.controller';
import { RoleController } from './role/role.controller';
import { ShareAdminController } from './share/share-admin.controller';
import { ShareRequestAdminController } from './share-request/share-request-admin.controller';
import { ExternalUserAdminController } from './external-user/external-user-admin.controller';
import { UserAdminController } from './user/user-admin.controller';
import { ObservabilityController } from './observability.controller';
import { TimelineAdminController } from './timeline/timeline-admin.controller';

// 비즈니스 모듈
import { AuditModule } from '../../../business/audit/audit.module';
import { BusinessModule } from '../../../business/business.module';
import { RepositoryModule } from '../../../infra/database/repository.module';

/**
 * Admin 컨트롤러 모듈
 *
 * 관리자용 API 엔드포인트 제공
 * - 시스템 관리 (헬스체크, 저장소 일관성 검사)
 * - 감사 로그 조회
 * - 보안 로그 조회
 * - 파일 이력 조회
 * - 역할/권한 관리
 * - 공유 링크 관리
 * - 외부 사용자 관리
 */
@Module({
  imports: [
    AuditModule,
    BusinessModule,
    RepositoryModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('INNER_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AdminController,
    AuditLogController,
    RoleController,
    ShareAdminController,
    ShareRequestAdminController,
    ExternalUserAdminController,
    UserAdminController,
    ObservabilityController,
    TimelineAdminController,
  ],
})
export class AdminModule {}
