import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExternalShareInfraModule } from '../../infra/database/external-share-infra.module';
import { RepositoryModule } from '../../infra/database/repository.module';
import { CacheInfraModule } from '../../infra/cache/cache-infra.module';
import { FileBusinessModule } from '../file/file.module';
import { ExternalShareDomainModule } from '../../domain/external-share/external-share.module';

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
 *
 * 보안 주의:
 * - 외부 사용자 인증은 내부 사용자와 분리된 EXTERNAL_JWT_SECRET 사용
 * - 내부/외부 시스템 간 토큰 교차 사용 방지
 */
@Module({
  imports: [
    ExternalShareInfraModule,
    RepositoryModule,
    CacheInfraModule,
    ConfigModule,
    // 파일 다운로드를 위한 FileBusinessModule
    FileBusinessModule,
    // 도메인 서비스 (PublicShare + File 조합)
    ExternalShareDomainModule,
    // 외부 사용자 전용 JWT 설정 (내부 사용자와 분리된 시크릿)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('EXTERNAL_JWT_SECRET');
        if (!secret) {
          throw new Error(
            'EXTERNAL_JWT_SECRET 환경변수가 설정되지 않았습니다. ' +
              '외부 사용자 인증을 위해 반드시 설정해야 합니다.',
          );
        }
        return {
          secret,
          signOptions: { expiresIn: parseInt(configService.get<string>('EXTERNAL_JWT_EXPIRES_IN') || '900') }, // Access Token 기본 만료: 15분
        };
      },
      inject: [ConfigService],
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
    // Infra Module (가드에서 Repository 사용)
    ExternalShareInfraModule,
    // Business Services
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
