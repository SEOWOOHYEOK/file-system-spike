import { Module } from '@nestjs/common';
import { AdminDomainModule } from '../../domain/admin/admin.module';
import { AdminService } from './admin.service';

/**
 * Admin 비즈니스 모듈
 * Admin 비즈니스 로직을 제공합니다.
 */
@Module({
  imports: [AdminDomainModule],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminBusinessModule {}
