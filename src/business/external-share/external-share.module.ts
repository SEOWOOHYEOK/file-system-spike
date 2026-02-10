import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheInfraModule } from '../../infra/cache/cache-infra.module';
import { FileBusinessModule } from '../file/file.module';
import { AuditModule } from '../audit/audit.module';
import { ExternalShareDomainModule } from '../../domain/external-share/external-share.module';
import { FileDomainModule } from '../../domain/file/file.module';

// Services
import { PublicShareManagementService } from './public-share-management.service';
import { ExternalShareAccessService } from './external-share-access.service';
import { PublicShareDomainService } from './public-share-domain.service';

// Security Services
import { TokenBlacklistService } from './security/token-blacklist.service';

/**
 * ExternalShare Business 모듈
 *
 * 외부 파일 공유 시스템의 비즈니스 레이어
 *
 * 보안 기능:
 * - 토큰 블랙리스트 (TokenBlacklistService)
 *
 * 보안 주의:
 * - 외부 사용자 인증은 내부 사용자와 분리된 EXTERNAL_JWT_SECRET 사용
 * - 내부/외부 시스템 간 토큰 교차 사용 방지
 */
@Module({
  imports: [
    ExternalShareDomainModule,
    FileDomainModule,
    CacheInfraModule,
    ConfigModule,
    // 파일 다운로드를 위한 FileBusinessModule
    FileBusinessModule,
    // 감사 로그 모듈
    AuditModule,
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
    PublicShareManagementService,
    ExternalShareAccessService,
    PublicShareDomainService,
    // Security Services
    TokenBlacklistService,
  ],
  exports: [
    // Business Services
    PublicShareManagementService,
    ExternalShareAccessService,
    PublicShareDomainService,
    // Security Services (가드에서 사용)
    TokenBlacklistService,
  ],
})
export class ExternalShareModule {}
