import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainModule } from './domain/domain.module';
import { BusinessModule } from './business/business.module';
import { InterfaceModule } from './interface/interface.module';
import { RepositoryModule } from './infra/database/repository.module';
import { SSOModule } from './integrations/sso';
import { OrganizationMigrationModule } from './integrations/migration';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

/**
 * 루트 애플리케이션 모듈
 * 
 * DDD 구조:
 * - Domain: 순수 도메인 로직 (엔티티, DTO, 리포지토리 인터페이스)
 * - Business: 비즈니스 유스케이스 (서비스)
 * - Interface: HTTP 컨트롤러
 * - Infra: 데이터베이스, 스토리지 등 인프라 구현
 */
@Module({
  imports: [
    // 환경변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // 스케줄링 모듈 (Cron 작업용)
    ScheduleModule.forRoot(),
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
