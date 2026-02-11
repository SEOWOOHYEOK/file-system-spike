import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UserDomainModule } from '../../domain/user/user.module';
import { ExternalShareDomainModule } from '../../domain/external-share';
import { OrganizationModule } from '../../integrations/migration/organization/organization.module';
import { EmployeeDepartmentPosition } from '../../integrations/migration/organization/entities/employee-department-position.entity';
import { RefreshTokenOrmEntity } from '../../infra/database/entities/refresh-token.orm-entity';
import { AuthUserLookupService } from './auth-user-lookup.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Auth 비즈니스 모듈
 *
 * Guard에서 사용하는 사용자 조회 서비스를 제공합니다.
 * - AuthUserLookupService: JWT 검증 후 DB에서 사용자 정보 조회
 * - RefreshTokenService: 리프레시 토큰 생성/로테이션/무효화
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeDepartmentPosition, RefreshTokenOrmEntity]),
    JwtModule.register({}),
    forwardRef(() => UserDomainModule),
    forwardRef(() => ExternalShareDomainModule),
    OrganizationModule,
  ],
  providers: [AuthUserLookupService, RefreshTokenService],
  exports: [
    AuthUserLookupService,
    RefreshTokenService,
    TypeOrmModule.forFeature([EmployeeDepartmentPosition]),
  ],
})
export class AuthModule {}
