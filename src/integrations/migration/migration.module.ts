import { Module } from '@nestjs/common';
import { OrganizationMigrationService } from './migration.service';
import { SSOModule } from '../sso/sso.module';
import { OrganizationModule } from './organization/organization.module';

/**
 * 조직 데이터 마이그레이션 모듈
 *
 * SSO에서 조직 데이터를 가져와서 로컬 데이터베이스에 동기화하는 기능을 제공합니다.
 */
@Module({
    imports: [SSOModule, OrganizationModule],
    providers: [OrganizationMigrationService],
    exports: [OrganizationMigrationService],
})
export class OrganizationMigrationModule {}
