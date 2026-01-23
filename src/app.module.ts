import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainModule } from './domain/domain.module';
import { BusinessModule } from './business/business.module';
import { InterfaceModule } from './interface/interface.module';

/**
 * 루트 애플리케이션 모듈
 * 
 * DDD 구조:
 * - Domain: 순수 도메인 로직 (엔티티, DTO, 리포지토리 인터페이스)
 * - Business: 비즈니스 유스케이스 (서비스)
 * - Interface: HTTP 컨트롤러
 */
@Module({
  imports: [
    DomainModule,
    BusinessModule,
    InterfaceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
