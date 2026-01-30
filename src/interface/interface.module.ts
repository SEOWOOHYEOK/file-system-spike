import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// 기본 컨트롤러
import { FileController } from './controller/file/file.controller';
import { MultipartController } from './controller/file/multipart.controller';
import { FolderController } from './controller/folder/folder.controller';
import { AuthController } from './controller/auth/auth.controller';
import { TrashController } from './controller/trash/trash.controller';
import { UserController } from './controller/user/user.controller';
import { PublicShareController } from './controller/share/share.controller';
import { ExternalUsersController } from './controller/share/share.controller';

// 외부 사용자 컨트롤러
import { ExternalAuthController } from './controller/external-auth/external-auth.controller';
import { ExternalShareController } from './controller/external-auth/external-share.controller';

// 동기화 컨트롤러
import { SyncEventController } from './controller/sync-event/sync-event.controller';

// 모듈
import { AdminModule } from './controller/admin/admin.module';
import { BusinessModule } from '../business/business.module';
import { SSOModule } from '../integrations/sso/sso.module';
import { OrganizationMigrationModule } from '../integrations/migration/migration.module';
import { ExternalShareModule } from '../business/external-share/external-share.module';
import { ExternalShareDomainModule } from '../domain/external-share/external-share.module';

// 인터셉터
import { AuditLogInterceptor } from '../common/interceptors';
import { DomainModule } from '../domain/domain.module';

/**
 * 인터페이스 레이어 통합 모듈
 * 파일, 폴더, 휴지통, 인증, Admin, User, Share 컨트롤러를 통합합니다.
 */
@Module({
  imports: [
    // 기능 모듈
    DomainModule,
    AdminModule,
    BusinessModule,
    SSOModule,
    OrganizationMigrationModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('INNER_SECRET'),
        signOptions: {
          // 기본 만료시간 없음 (필요시 개별 설정)
          expiresIn: parseInt(configService.get<string>('JWT_EXPIRES_IN') || '0'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    // 기본 컨트롤러
    FileController,
    MultipartController,
    FolderController,
    TrashController,
    AuthController,
    UserController,
    // 외부 사용자 컨트롤러
    ExternalAuthController,
    ExternalShareController,
    PublicShareController,
    ExternalUsersController,
    // 동기화 컨트롤러
    SyncEventController,
  ],
  providers: [
    // 글로벌 인터셉터: 감사 로그 자동 기록
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class InterfaceModule {}
