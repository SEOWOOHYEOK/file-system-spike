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
import { ShareRequestCreateController } from './controller/share/share-request-create.controller';
import { MySentShareController } from './controller/share/my-sent-share.controller';
import { MyReceivedRequestController } from './controller/share/my-received-request.controller';

// 외부 사용자 컨트롤러
import { ExternalShareController } from './controller/external-auth/external-share.controller';


// 내 정보 컨트롤러 (user 폴더에 위치)


// 모듈
import { AdminModule } from './controller/admin/admin.module';
import { BusinessModule } from '../business/business.module';
import { StorageInfraModule } from '../infra/storage/storage-infra.module';
import { SSOModule } from '../integrations/sso/sso.module';
import { OrganizationMigrationModule } from '../integrations/migration/migration.module';


// 인터셉터
import { AuditLogInterceptor } from '../common/interceptors';
import { DomainModule } from '../domain/domain.module';

import { UserAuditLogController } from './controller/user/audit.controller';
import { UserFavoriteController } from './controller/user/userFavorite.controller';
import { FileActionRequestController } from './controller/file-action-request/file-action-request.controller';

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
    StorageInfraModule, // NasAvailabilityGuard가 NasStatusCacheService를 주입받기 위해 필요
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
    ExternalShareController,
    // 파일 공유 컨트롤러 (700, 701, 702)
    ShareRequestCreateController,    // 700번 - 공유 요청 생성
    MySentShareController,           // 701번 - 내가 보낸 공유 관리
    MyReceivedRequestController,     // 702번 - 내가 받은 공유 요청 관리
    // 내 정보 컨트롤러
    UserFavoriteController,
    UserAuditLogController,
    FileActionRequestController,
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
