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
import { PublicShareController } from './controller/share/share.controller';
import { ExternalUsersController } from './controller/share/share.controller';

// 외부 사용자 컨트롤러
import { ExternalAuthController } from './controller/external-auth/external-auth.controller';
import { ExternalShareController } from './controller/external-auth/external-share.controller';

// 동기화 컨트롤러
import { SyncEventController } from './controller/sync-event/sync-event.controller';

// 내 정보 컨트롤러 (user 폴더에 위치)


// 모듈
import { AdminModule } from './controller/admin/admin.module';
import { BusinessModule } from '../business/business.module';
import { SSOModule } from '../integrations/sso/sso.module';
import { OrganizationMigrationModule } from '../integrations/migration/migration.module';


// 인터셉터
import { AuditLogInterceptor } from '../common/interceptors';
import { DomainModule } from '../domain/domain.module';

import { UserAuditLogController } from './controller/user/audit.controller';
import { UserFavoriteController } from './controller/user/userFavorite.controller';

// 공유 요청 컨트롤러
import { ShareRequestController } from './controller/share-request/share-request.controller';


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
    // 외부 사용자 컨트롤러
    ExternalAuthController,
    ExternalShareController,
    PublicShareController,
    ExternalUsersController,
    // 동기화 컨트롤러
    SyncEventController,
    // 내 정보 컨트롤러
    UserFavoriteController,
    UserAuditLogController,
    // 공유 요청 컨트롤러
    ShareRequestController,
  ],
  providers: [
    // 글로벌 인터셉터: 감사 로그 자동 기록
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class InterfaceModule { }
