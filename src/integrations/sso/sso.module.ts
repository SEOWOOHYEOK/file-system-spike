import { config } from 'dotenv';
config(); // ConfigModule보다 먼저 .env 로드 (top-level 코드에서 process.env 접근 필요)

import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SSOClient } from '@lumir-company/sso-sdk';
import { SSOService } from './sso.service';
import { MockSSOService } from './mock-sso.service';
import { SSO_CLIENT } from './sso.constants';


/**
 * NODE_ENV=dev 이면 Mock SSO 모드를 활성화합니다.
 * - Mock 모드: 실제 SSO 서버 없이 테스트 유저(seed-test-users.ts)로 동작
 * - 그 외(development, production 등): 실제 SSO 서버 연동
 */
const NODE_ENV = process.env.NODE_ENV ;

const isMockSSOMode = NODE_ENV === 'dev';


// ─── 실제 SSO 프로바이더 ────────────────────────────────────
const realSSOProviders = [
    {
        provide: SSO_CLIENT,
        useFactory: async (configService: ConfigService) => {
            const logger = new Logger('SSOModule');
            const baseUrl = configService.get<string>('SSO_BASE_URL');
            const clientId = configService.get<string>('SSO_CLIENT_ID');
            const clientSecret = configService.get<string>('SSO_CLIENT_SECRET');

            if (!clientId || !clientSecret) {
                logger.warn('SSO_CLIENT_ID 또는 SSO_CLIENT_SECRET가 설정되지 않았습니다.');
                throw new Error('SSO 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.');
            }

            if (!baseUrl) {
                logger.warn('SSO_BASE_URL이 설정되지 않았습니다.');
                throw new Error('SSO_BASE_URL 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.');
            }

            const client = new SSOClient({
                baseUrl,
                clientId,
                clientSecret,
                timeoutMs: 10000,
                retries: 3,
                enableLogging: process.env.NODE_ENV === 'development',
            });

            // 시스템 인증
            try {
                await client.initialize();
                logger.log(`SSO 클라이언트 초기화 완료: ${client.getSystemName()}`);
            } catch (error) {
                logger.error('SSO 시스템 인증 실패', error);
                throw error;
            }

            return client;
        },
        inject: [ConfigService],
    },
    SSOService,
];

// ─── Mock SSO 프로바이더 (NODE_ENV=dev) ─────────────────────
const mockSSOProviders = [
    {
        provide: SSO_CLIENT,
        useValue: null, // Mock 모드에서는 SSO 클라이언트 불필요
    },
    {
        provide: SSOService,
        useClass: MockSSOService,
    },
];

@Module({
    imports: [ConfigModule],
    providers: isMockSSOMode ? mockSSOProviders : realSSOProviders,
    exports: [SSOService, SSO_CLIENT],
})
export class SSOModule { }
