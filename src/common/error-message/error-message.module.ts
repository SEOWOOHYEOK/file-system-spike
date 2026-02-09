import { Global, Module } from '@nestjs/common';
import { ErrorMessageService } from './error-message.service';
import { RepositoryModule } from '../../infra/database/repository.module';

/**
 * ErrorMessageModule
 *
 * 에러 메시지 서비스를 제공하는 전역 모듈
 * - GlobalExceptionFilter에서 어디서든 접근 가능하도록 @Global() 데코레이터 사용
 */
@Global()
@Module({
  imports: [RepositoryModule],
  providers: [ErrorMessageService],
  exports: [ErrorMessageService],
})
export class ErrorMessageModule {}
