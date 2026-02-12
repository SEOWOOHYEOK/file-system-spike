import { Module } from '@nestjs/common';
import { DepartmentQueryService } from './department-query.service';

/**
 * 부서 비즈니스 모듈
 *
 * departments-info 테이블 기반 부서 계층 구조 조회 서비스를 제공합니다.
 */
@Module({
  providers: [DepartmentQueryService],
  exports: [DepartmentQueryService],
})
export class DepartmentBusinessModule {}
