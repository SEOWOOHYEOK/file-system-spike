import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExternalShareInfraModule } from '../../infra/database/external-share-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { CacheInfraModule } from '../../infra/cache/cache-infra.module';

// Services
import { ExternalUserManagementService } from './external-user-management.service';
import { PublicShareManagementService } from './public-share-management.service';
import { ExternalAuthService } from './external-auth.service';
import { ExternalShareAccessService } from './external-share-access.service';

// Security Services
import { LoginAttemptService } from './security/login-attempt.service';
import { TokenBlacklistService } from './security/token-blacklist.service';

/**
 * ExternalShare Business 모듈
 *
 * 외부 파일 공유 시스템의 비즈니스 레이어
 *
 * 보안 기능:
 * - 로그인 실패 횟수 제한 (LoginAttemptService)
 * - 토큰 블랙리스트 (TokenBlacklistService)
 */
@Module({
  imports: [
    ExternalShareInfraModule,
    RepositoryModule,
    CacheInfraModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'external-share-secret',
      signOptions: { expiresIn: '15m' }, // Access Token 기본 만료: 15분
    }),
  ],
  providers: [
    // Business Services
    ExternalUserManagementService,
    PublicShareManagementService,
    ExternalAuthService,
    ExternalShareAccessService,
    // Security Services
    LoginAttemptService,
    TokenBlacklistService,
  ],
  exports: [
    ExternalUserManagementService,
    PublicShareManagementService,
    ExternalAuthService,
    ExternalShareAccessService,
    // Security Services (가드에서 사용)
    LoginAttemptService,
    TokenBlacklistService,
  ],
})
export class ExternalShareModule {}
