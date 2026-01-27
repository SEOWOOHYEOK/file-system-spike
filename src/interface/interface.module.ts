import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FileController } from './controller/file/file.controller';
import { FolderController } from './controller/folder/folder.controller';
import { AuthController } from './controller/auth/auth.controller';
import { TrashController } from './trash/trash.controller';
import { AdminController } from './controller/admin/admin.controller';
import { RoleController } from './controller/role/role.controller';
import { UserController } from './controller/user/user.controller';
import { ShareController } from './controller/share/share.controller';
import { BusinessModule } from '../business/business.module';
import { SSOModule } from '../integrations/sso/sso.module';
import { OrganizationMigrationModule } from '../integrations/migration/migration.module';

/**
 * 인터페이스 레이어 통합 모듈
 * 파일, 폴더, 휴지통, 인증, Admin, User, Share 컨트롤러를 통합합니다.
 */
@Module({
  imports: [
    BusinessModule,
    SSOModule,
    OrganizationMigrationModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || configService.get<string>('GLOBAL_SECRET'),
        signOptions: {
          // 기본 만료시간 없음 (필요시 개별 설정)
          expiresIn: parseInt(configService.get<string>('JWT_EXPIRES_IN') || '0'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    FileController,
    FolderController,
    TrashController,
    AuthController,
    AdminController,
    RoleController,
    UserController,
    ShareController,
  ],
})
export class InterfaceModule {}
