import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { SSOService } from '../sso/sso.service';
import {
    ExportAllDataRequest,
    ExportAllDataResponse,
    ExportDepartmentDto,
    ExportEmployeeDto,
    ExportPositionDto,
    ExportRankDto,
    ExportEmployeeDepartmentPositionDto,
    ExportAssignmentHistoryDto,
} from '@lumir-company/sso-sdk';
import {
    DomainDepartmentService,
    DomainEmployeeService,
    DomainPositionService,
    DomainRankService,
    DomainEmployeeDepartmentPositionService,
    DomainEmployeeDepartmentPositionHistoryService,
    Department,
    DepartmentType,
    Employee,
    Gender,
    EmployeeStatus,
    Position,
    Rank,
    EmployeeDepartmentPosition,
    EmployeeDepartmentPositionHistory,
} from './organization';

/**
 * 조직 데이터 마이그레이션 서비스
 *
 * SSO에서 모든 조직 데이터를 가져와서 로컬 데이터베이스에 동기화합니다.
 * 순서: Rank -> Position -> Department -> Employee -> EmployeeDepartmentPosition -> EmployeeDepartmentPositionHistory
 */
@Injectable()
export class OrganizationMigrationService {
    private readonly logger = new Logger(OrganizationMigrationService.name);

    constructor(
        private readonly ssoService: SSOService,
        private readonly departmentService: DomainDepartmentService,
        private readonly employeeService: DomainEmployeeService,
        private readonly positionService: DomainPositionService,
        private readonly rankService: DomainRankService,
        private readonly employeeDepartmentPositionService: DomainEmployeeDepartmentPositionService,
        private readonly employeeDepartmentPositionHistoryService: DomainEmployeeDepartmentPositionHistoryService,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * SSO에서 모든 조직 데이터를 가져와서 로컬 DB에 동기화한다
     *
     * 두 단계로 나누어 실행:
     * 1단계: Rank, Position, Department, Employee 마이그레이션 후 커밋
     * 2단계: EmployeeDepartmentPosition, EmployeeDepartmentPositionHistory 마이그레이션 후 커밋
     */
    async 마이그레이션한다(params?: ExportAllDataRequest): Promise<{
        success: boolean;
        statistics: {
            ranks: number;
            positions: number;
            departments: number;
            employees: number;
            employeeDepartmentPositions: number;
            assignmentHistories: number;
        };
    }> {
        this.logger.log('SSO 조직 데이터 마이그레이션 시작');

        // 1. SSO에서 모든 데이터 가져오기
        const ssoData = await this.ssoService.exportAllData(params);
        this.logger.log(
            `SSO 데이터 조회 완료: 부서 ${ssoData.totalCounts.departments}개, 직원 ${ssoData.totalCounts.employees}명, 직급 ${ssoData.totalCounts.ranks}개, 직책 ${ssoData.totalCounts.positions}개`,
        );

        // 1단계: 기본 정보 마이그레이션 (Rank, Position, Department, Employee)
        const firstPhaseResult = await this.기본정보마이그레이션한다(ssoData);

        // 2단계: 배치 및 발령 데이터 마이그레이션 (EmployeeDepartmentPosition, EmployeeDepartmentPositionHistory)
        const secondPhaseResult = await this.배치및발령데이터마이그레이션한다(ssoData);

        // 실패한 직원들의 EmployeeNumber 조회 및 출력
        const allFailedEmployeeIds = [
            ...new Set([
                ...secondPhaseResult.edpResult.failedEmployeeIds,
                ...secondPhaseResult.historyResult.failedEmployeeIds,
            ]),
        ];
        if (allFailedEmployeeIds.length > 0) {
            this.실패한직원정보를출력한다(allFailedEmployeeIds, ssoData.employees);
        }

        this.logger.log('✅ SSO 조직 데이터 마이그레이션 완료');

        return {
            success: true,
            statistics: {
                ranks: firstPhaseResult.rankCount,
                positions: firstPhaseResult.positionCount,
                departments: firstPhaseResult.departmentCount,
                employees: firstPhaseResult.employeeCount,
                employeeDepartmentPositions: secondPhaseResult.edpResult.count,
                assignmentHistories: secondPhaseResult.historyResult.count,
            },
        };
    }

    /**
     * 기본 정보 마이그레이션 (1단계)
     */
    private async 기본정보마이그레이션한다(ssoData: ExportAllDataResponse): Promise<{
        rankCount: number;
        positionCount: number;
        departmentCount: number;
        employeeCount: number;
    }> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log('1단계: 기본 정보 마이그레이션 시작 (Rank, Position, Department, Employee)');

            // 1. Rank 마이그레이션 (의존성 없음)
            const rankCount = await this.마이그레이션Rank한다(ssoData.ranks, queryRunner);
            this.logger.log(`직급 마이그레이션 완료: ${rankCount}개`);

            // 2. Position 마이그레이션 (의존성 없음)
            const positionCount = await this.마이그레이션Position한다(ssoData.positions, queryRunner);
            this.logger.log(`직책 마이그레이션 완료: ${positionCount}개`);

            // 3. Department 마이그레이션 (parentDepartmentId 의존성)
            const departmentCount = await this.마이그레이션Department한다(ssoData.departments, queryRunner);
            this.logger.log(`부서 마이그레이션 완료: ${departmentCount}개`);

            // 4. Employee 마이그레이션 (currentRankId 의존성)
            const employeeCount = await this.마이그레이션Employee한다(ssoData.employees, queryRunner);
            this.logger.log(`직원 마이그레이션 완료: ${employeeCount}명`);

            await queryRunner.commitTransaction();
            this.logger.log('✅ 1단계: 기본 정보 마이그레이션 완료 및 커밋');

            return {
                rankCount,
                positionCount,
                departmentCount,
                employeeCount,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('1단계: 기본 정보 마이그레이션 실패', error);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * 배치 및 발령 데이터 마이그레이션 (2단계)
     */
    private async 배치및발령데이터마이그레이션한다(ssoData: ExportAllDataResponse): Promise<{
        edpResult: { count: number; failedEmployeeIds: string[] };
        historyResult: { count: number; failedEmployeeIds: string[] };
    }> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log('2단계: 배치 및 발령 데이터 마이그레이션 시작');

            // 1. EmployeeDepartmentPosition 마이그레이션
            const edpResult = await this.마이그레이션EmployeeDepartmentPosition한다(
                ssoData.employeeDepartmentPositions,
                queryRunner,
            );
            this.logger.log(`직원-부서-직책 마이그레이션 완료: ${edpResult.count}개`);

            // 2. EmployeeDepartmentPositionHistory 마이그레이션
            const historyResult = await this.마이그레이션EmployeeDepartmentPositionHistory한다(
                ssoData.assignmentHistories,
                queryRunner,
            );
            this.logger.log(`직원 발령 이력 마이그레이션 완료: ${historyResult.count}개`);

            await queryRunner.commitTransaction();
            this.logger.log('✅ 2단계: 배치 및 발령 데이터 마이그레이션 완료 및 커밋');

            return {
                edpResult,
                historyResult,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('2단계: 배치 및 발령 데이터 마이그레이션 실패', error);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Rank 마이그레이션
     */
    private async 마이그레이션Rank한다(ranks: ExportRankDto[], queryRunner: QueryRunner): Promise<number> {
        let count = 0;
        for (const rankDto of ranks) {
            const rank = new Rank();
            rank.id = rankDto.id;
            rank.rankTitle = rankDto.rankName;
            rank.rankCode = rankDto.rankCode;
            rank.level = rankDto.level;

            await this.rankService.save(rank, { queryRunner });
            count++;
        }
        return count;
    }

    /**
     * Position 마이그레이션
     */
    private async 마이그레이션Position한다(positions: ExportPositionDto[], queryRunner: QueryRunner): Promise<number> {
        let count = 0;
        for (const positionDto of positions) {
            const position = new Position();
            position.id = positionDto.id;
            position.positionTitle = positionDto.positionTitle;
            position.positionCode = positionDto.positionCode;
            position.level = positionDto.level;
            position.hasManagementAuthority = positionDto.hasManagementAuthority;

            await this.positionService.save(position, { queryRunner });
            count++;
        }
        return count;
    }

    /**
     * Department 마이그레이션
     */
    private async 마이그레이션Department한다(
        departments: ExportDepartmentDto[],
        queryRunner: QueryRunner,
    ): Promise<number> {
        let count = 0;
        const savedDepartmentIds = new Set<string>();

        // 퇴사자 부서를 배열 맨 앞에 추가
        const terminatedDepartment: ExportDepartmentDto = {
            id: 'ae6b09b3-3811-4d6a-af3b-bec84ea87b10',
            departmentName: '퇴사자',
            departmentCode: '퇴사자',
            type: 'DEPARTMENT',
            parentDepartmentId: null,
            order: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        let remainingDepartments = [terminatedDepartment, ...departments];
        const maxIterations = departments.length + 1;
        let iterations = 0;

        while (remainingDepartments.length > 0 && iterations < maxIterations) {
            iterations++;
            const toSave: ExportDepartmentDto[] = [];
            const stillRemaining: ExportDepartmentDto[] = [];

            for (const deptDto of remainingDepartments) {
                if (!deptDto.parentDepartmentId || savedDepartmentIds.has(deptDto.parentDepartmentId)) {
                    toSave.push(deptDto);
                } else {
                    stillRemaining.push(deptDto);
                }
            }

            for (const deptDto of toSave) {
                const department = new Department();
                department.id = deptDto.id;
                department.departmentName = deptDto.departmentName;
                department.departmentCode = deptDto.departmentCode;
                department.type = deptDto.type as DepartmentType;
                department.parentDepartmentId = deptDto.parentDepartmentId || undefined;
                department.order = deptDto.order;

                await this.departmentService.save(department, { queryRunner });
                savedDepartmentIds.add(deptDto.id);
                count++;
            }

            remainingDepartments = stillRemaining;

            if (toSave.length === 0) {
                if (remainingDepartments.length > 0) {
                    this.logger.warn(
                        `저장되지 않은 부서가 있습니다: ${remainingDepartments.map((d) => d.departmentName).join(', ')}`,
                    );
                }
                break;
            }
        }

        return count;
    }

    /**
     * Employee 마이그레이션
     */
    private async 마이그레이션Employee한다(employees: ExportEmployeeDto[], queryRunner: QueryRunner): Promise<number> {
        let count = 0;
        for (const empDto of employees) {
            const employee = new Employee();
            employee.id = empDto.id;
            employee.employeeNumber = empDto.employeeNumber;
            employee.name = empDto.name;
            employee.email = empDto.email || undefined;
            employee.phoneNumber = empDto.phoneNumber || undefined;
            employee.dateOfBirth = empDto.dateOfBirth ? new Date(empDto.dateOfBirth) : undefined;
            employee.gender = empDto.gender ? (empDto.gender as Gender) : undefined;
            employee.hireDate = new Date(empDto.hireDate);
            employee.status = empDto.status as EmployeeStatus;
            employee.currentRankId = empDto.currentRankId || undefined;
            employee.isInitialPasswordSet = empDto.isInitialPasswordSet;

            await this.employeeService.save(employee, { queryRunner });
            count++;
        }
        return count;
    }

    /**
     * EmployeeDepartmentPosition 마이그레이션
     */
    private async 마이그레이션EmployeeDepartmentPosition한다(
        edps: ExportEmployeeDepartmentPositionDto[],
        queryRunner: QueryRunner,
    ): Promise<{ count: number; failedEmployeeIds: string[] }> {
        let count = 0;
        const failedEmployeeIds: string[] = [];
        for (const edpDto of edps) {
            const itemQueryRunner = this.dataSource.createQueryRunner();
            await itemQueryRunner.connect();
            await itemQueryRunner.startTransaction();

            try {
                const edp = new EmployeeDepartmentPosition();
                edp.id = edpDto.id;
                edp.employeeId = edpDto.employeeId;
                edp.departmentId = edpDto.departmentId;
                edp.positionId = edpDto.positionId;
                edp.isManager = edpDto.isManager;

                await this.employeeDepartmentPositionService.save(edp, { queryRunner: itemQueryRunner });
                await itemQueryRunner.commitTransaction();
                count++;
            } catch (error: any) {
                await itemQueryRunner.rollbackTransaction();
                failedEmployeeIds.push(edpDto.employeeId);
                this.logger.warn(`직원-부서-직책 마이그레이션 실패 (ID: ${edpDto.id}): ${error.message}`);
            } finally {
                await itemQueryRunner.release();
            }
        }
        return { count, failedEmployeeIds };
    }

    /**
     * EmployeeDepartmentPositionHistory 마이그레이션
     */
    private async 마이그레이션EmployeeDepartmentPositionHistory한다(
        histories: ExportAssignmentHistoryDto[],
        queryRunner: QueryRunner,
    ): Promise<{ count: number; failedEmployeeIds: string[] }> {
        let count = 0;
        const failedEmployeeIds: string[] = [];
        for (const historyDto of histories) {
            const itemQueryRunner = this.dataSource.createQueryRunner();
            await itemQueryRunner.connect();
            await itemQueryRunner.startTransaction();

            try {
                const history = new EmployeeDepartmentPositionHistory();
                history.historyId = historyDto.historyId;
                history.employeeId = historyDto.employeeId;
                history.부서를설정한다(historyDto.departmentId);
                history.상위부서를설정한다(historyDto.parentDepartmentId || undefined);
                history.직책을설정한다(historyDto.positionId);
                history.직급을설정한다(historyDto.rankId || undefined);
                history.관리자권한을설정한다(historyDto.isManager);
                history.effectiveStartDate = historyDto.effectiveStartDate;
                history.effectiveEndDate = historyDto.effectiveEndDate || null;
                history.isCurrent = historyDto.isCurrent;
                history.assignmentReason = historyDto.assignmentReason || undefined;

                await this.employeeDepartmentPositionHistoryService.save(history, { queryRunner: itemQueryRunner });
                await itemQueryRunner.commitTransaction();
                count++;
            } catch (error: any) {
                await itemQueryRunner.rollbackTransaction();
                failedEmployeeIds.push(historyDto.employeeId);
                this.logger.warn(
                    `직원 발령 이력 마이그레이션 실패 (historyId: ${historyDto.historyId}): ${error.message}`,
                );
            } finally {
                await itemQueryRunner.release();
            }
        }
        return { count, failedEmployeeIds };
    }

    /**
     * 실패한 직원들의 EmployeeNumber를 조회하여 출력한다
     */
    private 실패한직원정보를출력한다(failedEmployeeIds: string[], ssoEmployees: ExportEmployeeDto[]): void {
        if (failedEmployeeIds.length === 0) {
            return;
        }

        const employeeMap = new Map(ssoEmployees.map((emp) => [emp.id, emp.employeeNumber]));
        const employeeNumbers: string[] = [];
        const notFoundEmployeeIds: string[] = [];

        for (const employeeId of failedEmployeeIds) {
            const employeeNumber = employeeMap.get(employeeId);
            if (employeeNumber) {
                employeeNumbers.push(employeeNumber);
            } else {
                notFoundEmployeeIds.push(employeeId);
            }
        }

        if (employeeNumbers.length > 0) {
            this.logger.warn(
                `마이그레이션 실패한 직원 사번 (총 ${employeeNumbers.length}명): ${employeeNumbers.join(', ')}`,
            );
        }

        if (notFoundEmployeeIds.length > 0) {
            this.logger.warn(
                `마이그레이션 실패한 직원 ID (SSO 데이터에서 찾을 수 없음, ${notFoundEmployeeIds.length}명): ${notFoundEmployeeIds.join(', ')}`,
            );
        }
    }
}
