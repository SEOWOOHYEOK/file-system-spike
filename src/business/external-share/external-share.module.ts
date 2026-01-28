import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExternalShareInfraModule } from '../../infra/database/external-share-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';

// Services
import { ExternalUserManagementService } from './external-user-management.service';
import { PublicShareManagementService } from './public-share-management.service';
import { ExternalAuthService } from './external-auth.service';
import { ExternalShareAccessService } from './external-share-access.service';

/**
 * ExternalShare Business 모듈
 *
 * 외부 파일 공유 시스템의 비즈니스 레이어
 */
@Module({
  imports: [
    ExternalShareInfraModule,
    RepositoryModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'external-share-secret',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  providers: [
    ExternalUserManagementService,
    PublicShareManagementService,
    ExternalAuthService,
    ExternalShareAccessService,
  ],
  exports: [
    ExternalUserManagementService,
    PublicShareManagementService,
    ExternalAuthService,
    ExternalShareAccessService,
  ],
})
export class ExternalShareModule {}
