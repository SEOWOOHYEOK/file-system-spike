import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SSOClient } from '@lumir-company/sso-sdk';
import { SSOService } from './sso.service';
import { SSO_CLIENT } from './sso.constants';

@Module({
    imports: [ConfigModule],
    providers: [
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
    ],
    exports: [SSOService, SSO_CLIENT],
})
export class SSOModule {}
