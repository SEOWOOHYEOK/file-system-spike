import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    Rank,
    Position,
    Department,
    Employee,
    EmployeeDepartmentPosition,
    EmployeeDepartmentPositionHistory,
} from './entities';
import {
    DomainRankService,
    DomainPositionService,
    DomainDepartmentService,
    DomainEmployeeService,
    DomainEmployeeDepartmentPositionService,
    DomainEmployeeDepartmentPositionHistoryService,
} from './services';

/**
 * 조직 도메인 모듈
 *
 * 조직 관련 엔티티와 서비스를 통합합니다.
 * - Rank (직급)
 * - Position (직책)
 * - Department (부서)
 * - Employee (직원)
 * - EmployeeDepartmentPosition (직원-부서-직책 배정)
 * - EmployeeDepartmentPositionHistory (발령 이력)
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            Rank,
            Position,
            Department,
            Employee,
            EmployeeDepartmentPosition,
            EmployeeDepartmentPositionHistory,
        ]),
    ],
    providers: [
        DomainRankService,
        DomainPositionService,
        DomainDepartmentService,
        DomainEmployeeService,
        DomainEmployeeDepartmentPositionService,
        DomainEmployeeDepartmentPositionHistoryService,
    ],
    exports: [
        DomainRankService,
        DomainPositionService,
        DomainDepartmentService,
        DomainEmployeeService,
        DomainEmployeeDepartmentPositionService,
        DomainEmployeeDepartmentPositionHistoryService,
    ],
})
export class OrganizationModule {}
