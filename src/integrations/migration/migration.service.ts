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
     * 세 단계로 나누어 실행:
     * 0단계: 기존 테이블 데이터 전체 삭제 (FK 역순)
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

        // 0. 기존 데이터 전체 삭제
        await this.기존데이터를삭제한다();

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
     * 기존 조직 데이터를 모두 삭제한다
     *
     * FK 의존성 역순으로 삭제:
     * 1. employee_department_position_history (Employee, Department, Position, Rank 참조)
     * 2. employee_department_positions (Employee, Department, Position 참조)
     * 3. employees-info (Rank 참조)
     * 4. departments-info (자기참조)
     * 5. positions
     * 6. ranks
     */
    private async 기존데이터를삭제한다(): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log('기존 조직 데이터 삭제 시작 (FK 역순)');

            const tables = [
                'employee_department_position_history',
                'employee_department_positions',
                'employees-info',
                'departments-info',
                'positions',
                'ranks',
            ];

            for (const table of tables) {
                const result = await queryRunner.query(`DELETE FROM "${table}"`);
                const deletedCount = result?.[1] ?? result?.rowCount ?? 0;
                this.logger.log(`  "${table}" 삭제 완료: ${deletedCount}건`);
            }

            await queryRunner.commitTransaction();
            this.logger.log('✅ 기존 조직 데이터 삭제 완료');
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('기존 조직 데이터 삭제 실패', error);
            throw error;
        } finally {
            await queryRunner.release();
        }
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
     * EXTERNAL_DEPARTMENT_ID에 해당하는 부서(및 하위 부서)의 조직 데이터만 마이그레이션한다
     *
     * SSO에서 전체 데이터를 가져온 후, 지정된 부서 ID와 그 하위 부서에 속하는
     * 부서/직원/배치/발령 데이터만 필터링하여 저장합니다.
     * Rank, Position은 참조 데이터이므로 전체를 마이그레이션합니다.
     */
    async 외부조직만마이그레이션한다(
        externalDepartmentId: string,
        params?: ExportAllDataRequest,
    ): Promise<{
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
        this.logger.log(`외부 조직 마이그레이션 시작 (대상 부서: ${externalDepartmentId})`);

        // 1. SSO에서 모든 데이터 가져오기
        const ssoData = await this.ssoService.exportAllData(params);
        this.logger.log(
            `SSO 데이터 조회 완료: 부서 ${ssoData.totalCounts.departments}개, 직원 ${ssoData.totalCounts.employees}명`,
        );

        // 2. 대상 부서 ID와 하위 부서 ID 집합 구하기
        const targetDepartmentIds = this.하위부서ID를수집한다(externalDepartmentId, ssoData.departments);
        this.logger.log(`필터 대상 부서: ${targetDepartmentIds.size}개 (대상 부서 + 하위 부서)`);

        // 3. 필터링된 SSO 데이터 생성
        const filteredDepartments = ssoData.departments.filter((d) => targetDepartmentIds.has(d.id));

        const filteredEdps = ssoData.employeeDepartmentPositions.filter((edp) =>
            targetDepartmentIds.has(edp.departmentId),
        );

        // 필터링된 부서에 속한 직원 ID 집합
        const targetEmployeeIds = new Set(filteredEdps.map((edp) => edp.employeeId));
        const filteredEmployees = ssoData.employees.filter((emp) => targetEmployeeIds.has(emp.id));

        const filteredHistories = ssoData.assignmentHistories.filter((h) =>
            targetDepartmentIds.has(h.departmentId),
        );

        this.logger.log(
            `필터 결과: 부서 ${filteredDepartments.length}개, 직원 ${filteredEmployees.length}명, ` +
            `배치 ${filteredEdps.length}개, 발령이력 ${filteredHistories.length}개`,
        );

        // 4. 필터링된 데이터로 ExportAllDataResponse 구성
        const filteredSsoData: ExportAllDataResponse = {
            departments: filteredDepartments,
            employees: filteredEmployees,
            positions: ssoData.positions,       // 참조 데이터 - 전체 유지
            ranks: ssoData.ranks,               // 참조 데이터 - 전체 유지
            employeeDepartmentPositions: filteredEdps,
            assignmentHistories: filteredHistories,
            totalCounts: {
                departments: filteredDepartments.length,
                employees: filteredEmployees.length,
                positions: ssoData.positions.length,
                ranks: ssoData.ranks.length,
                employeeDepartmentPositions: filteredEdps.length,
                assignmentHistories: filteredHistories.length,
            },
            exportedAt: ssoData.exportedAt,
        };

        // 5. 기존 마이그레이션 단계 실행
        const firstPhaseResult = await this.기본정보마이그레이션한다(filteredSsoData);
        const secondPhaseResult = await this.배치및발령데이터마이그레이션한다(filteredSsoData);

        // 실패한 직원 정보 출력
        const allFailedEmployeeIds = [
            ...new Set([
                ...secondPhaseResult.edpResult.failedEmployeeIds,
                ...secondPhaseResult.historyResult.failedEmployeeIds,
            ]),
        ];
        if (allFailedEmployeeIds.length > 0) {
            this.실패한직원정보를출력한다(allFailedEmployeeIds, filteredSsoData.employees);
        }

        this.logger.log('✅ 외부 조직 마이그레이션 완료');

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
     * 지정된 부서 ID와 그 하위 부서 ID를 재귀적으로 수집한다
     */
    private 하위부서ID를수집한다(
        rootDepartmentId: string,
        departments: ExportDepartmentDto[],
    ): Set<string> {
        const result = new Set<string>([rootDepartmentId]);
        let changed = true;

        while (changed) {
            changed = false;
            for (const dept of departments) {
                if (dept.parentDepartmentId && result.has(dept.parentDepartmentId) && !result.has(dept.id)) {
                    result.add(dept.id);
                    changed = true;
                }
            }
        }

        return result;
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
