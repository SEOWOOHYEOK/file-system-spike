import { Module } from '@nestjs/common';
import { TrashService } from './trash.service';

/**
 * 휴지통 비즈니스 모듈
 * 휴지통 관련 비즈니스 서비스를 제공합니다.
 */
@Module({
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashBusinessModule {}
