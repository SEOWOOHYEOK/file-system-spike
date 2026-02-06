import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainModule } from './domain/domain.module';
import { BusinessModule } from './business/business.module';
import { InterfaceModule } from './interface/interface.module';
import { RepositoryModule } from './infra/database/repository.module';
import { SSOModule } from './integrations/sso';
import { OrganizationMigrationModule } from './integrations/migration';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { createWinstonConfig } from './common/logger/winston.config';

/**
 * 루트 애플리케이션 모듈
 *
 * DDD 구조:
 * - Domain: 순수 도메인 로직 (엔티티, DTO, 리포지토리 인터페이스)
 * - Business: 비즈니스 유스케이스 (서비스)
 * - Interface: HTTP 컨트롤러
 * - Infra: 데이터베이스, 스토리지 등 인프라 구현
 *
 * APP_MODE 환경변수:
 * - 'all' (기본): API + Workers + Schedulers 모두 실행
 * - 'api': API만 실행 (Workers, Cron 비활성)
 * - 'worker': 사용하지 않음 (별도 main-worker.ts 엔트리포인트 사용)
 */
const appMode = process.env.APP_MODE || 'all';

@Module({
  imports: [
    // 환경변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Winston 구조화 로깅
    WinstonModule.forRoot(
      createWinstonConfig(process.env.LOG_DIR || 'logs'),
    ),
    // 스케줄링 모듈 (Cron 작업용)
    // APP_MODE=api 에서는 미로드 → 모든 @Cron 데코레이터 자동 비활성화
    ...(appMode !== 'api' ? [ScheduleModule.forRoot()] : []),
    // SSO 통합 모듈
    SSOModule,
    // 조직 마이그레이션 모듈
    OrganizationMigrationModule,
    // 인프라 레이어
    RepositoryModule,
    // 도메인 레이어
    DomainModule,
    // 비즈니스 레이어
    BusinessModule,
    // 인터페이스 레이어
    InterfaceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 모든 라우트에 RequestContextMiddleware 적용
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
