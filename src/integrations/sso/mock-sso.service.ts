import { Injectable, Logger, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import type {
    LoginResponse,
    Employee,
    ValidateTokenResponse,
    GetEmployeesResponse,
    ExportAllDataResponse,
    GetEmployeesManagersResponse,
    GetDepartmentHierarchyResponse,
} from '@lumir-company/sso-sdk';

// ─── seed-test-users.ts 와 동일한 테스트 유저 정보 ──────────────
const TEST_PASSWORD = 'test1234';

interface MockUser {
    key: string;
    id: string;
    employeeNumber: string;
    name: string;
    email: string;
    password: string;
    isExternal: boolean;
    roleName: string;
}

/**
 * seed-test-users.ts 의 IDS / TEST_USERS 와 1:1 매핑
 */
const MOCK_USERS: MockUser[] = [
    {
        key: 'guest',
        id: 'aaaa0000-0001-4000-a000-000000000001',
        employeeNumber: 'TEST-GUEST-001',
        name: '테스트_외부인',
        email: 'test-guest@test.local',
        password: TEST_PASSWORD,
        isExternal: true,
        roleName: 'GUEST',
    },
    {
        key: 'user',
        id: 'aaaa0000-0001-4000-a000-000000000002',
        employeeNumber: 'TEST-USER-001',
        name: '테스트_사용자',
        email: 'test-user@test.local',
        password: TEST_PASSWORD,
        isExternal: false,
        roleName: 'USER',
    },
    {
        key: 'manager',
        id: 'aaaa0000-0001-4000-a000-000000000003',
        employeeNumber: 'TEST-MGR-001',
        name: '테스트_매니저',
        email: 'test-manager@test.local',
        password: TEST_PASSWORD,
        isExternal: false,
        roleName: 'MANAGER',
    },
    {
        key: 'admin',
        id: 'aaaa0000-0001-4000-a000-000000000004',
        employeeNumber: 'TEST-ADM-001',
        name: '테스트_관리자',
        email: 'test-admin@test.local',
        password: TEST_PASSWORD,
        isExternal: false,
        roleName: 'ADMIN',
    },
];

const MOCK_DEPARTMENT = {
    id: 'aaaa0000-0000-4000-a000-000000000001',
    departmentName: '테스트부서',
    departmentCode: 'TEST-DEPT-001',
};

const MOCK_POSITION = {
    id: 'aaaa0000-0000-4000-a000-000000000002',
    positionTitle: '테스트직원',
};

const MOCK_RANK = {
    id: 'aaaa0000-0000-4000-a000-000000000003',
    rankName: '테스트직급',
};

// ─── Mock SSO Service ───────────────────────────────────────────

/**
 * Mock SSO 서비스
 *
 * NODE_ENV=dev 일 때 실제 SSO 서버 없이 테스트 유저로 동작합니다.
 * seed-test-users.ts 스크립트의 데이터와 동일한 유저 정보를 사용합니다.
 *
 * 사전 조건: `npm run seed:test-users` 로 DB에 테스트 유저가 생성되어 있어야 합니다.
 *
 * 로그인 정보:
 *   ┌──────────┬──────────────────────────┬──────────┐
 *   │ 역할     │ 이메일                    │ 비밀번호 │
 *   ├──────────┼──────────────────────────┼──────────┤
 *   │ GUEST    │ test-guest@test.local    │ test1234 │
 *   │ USER     │ test-user@test.local     │ test1234 │
 *   │ MANAGER  │ test-manager@test.local  │ test1234 │
 *   │ ADMIN    │ test-admin@test.local    │ test1234 │
 *   └──────────┴──────────────────────────┴──────────┘
 */
@Injectable()
export class MockSSOService implements OnModuleInit {
    private readonly logger = new Logger('MockSSOService');

    async onModuleInit(): Promise<void> {
        this.logger.warn('══════════════════════════════════════════════════════════');
        this.logger.warn('  🔶 Mock SSO 서비스 활성화 (NODE_ENV=dev)');
        this.logger.warn('  실제 SSO 연동 없이 테스트 유저로 동작합니다.');
        this.logger.warn('──────────────────────────────────────────────────────────');
        for (const user of MOCK_USERS) {
            this.logger.warn(
                `  ${user.roleName.padEnd(7)} │ ${user.email.padEnd(26)} │ ${user.password}`,
            );
        }
        this.logger.warn('══════════════════════════════════════════════════════════');
    }

    // ─── 유저 검색 헬퍼 ──────────────────────────────────

    private findByEmail(email: string): MockUser | undefined {
        return MOCK_USERS.find((u) => u.email === email);
    }

    private findByEmployeeNumber(employeeNumber: string): MockUser | undefined {
        return MOCK_USERS.find((u) => u.employeeNumber === employeeNumber);
    }

    private findById(id: string): MockUser | undefined {
        return MOCK_USERS.find((u) => u.id === id);
    }

    private toEmployee(user: MockUser): Employee {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            employeeNumber: user.employeeNumber,
            hireDate: '2025-01-01',
            status: '재직중',
            department: MOCK_DEPARTMENT,
            position: MOCK_POSITION,
            rank: MOCK_RANK,
        };
    }

    // ─── SSO 인증 메서드 ─────────────────────────────────

    /**
     * Mock 로그인
     *
     * 테스트 유저의 email + password(test1234)로 로그인합니다.
     */
    async login(email: string, password: string): Promise<LoginResponse> {
        this.logger.debug(`[Mock] 로그인 시도: ${email}`);

        const user = this.findByEmail(email);
        if (!user || user.password !== password) {
            throw new UnauthorizedException(
                `이메일 또는 비밀번호가 일치하지 않습니다. (Mock SSO - 사용 가능한 이메일: ${MOCK_USERS.map((u) => u.email).join(', ')})`,
            );
        }

        this.logger.log(`[Mock] 로그인 성공: ${email} (${user.employeeNumber})`);

        return {
            tokenType: 'Bearer',
            accessToken: `mock-sso-token-${user.key}-${Date.now()}`,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
            refreshToken: `mock-refresh-${user.key}-${Date.now()}`,
            id: user.id,
            name: user.name,
            email: user.email,
            employeeNumber: user.employeeNumber,
            status: '재직중',
        };
    }

    /**
     * Mock 토큰 검증
     */
    async verifyToken(token: string): Promise<ValidateTokenResponse> {
        this.logger.debug('[Mock] 토큰 검증 (항상 valid 반환)');
        return { valid: true };
    }

    /**
     * Mock 토큰 갱신
     */
    async refreshToken(refreshToken: string): Promise<LoginResponse> {
        this.logger.debug('[Mock] 토큰 갱신');
        const user = MOCK_USERS[1]; // USER 역할 기본 반환
        return {
            tokenType: 'Bearer',
            accessToken: `mock-sso-token-${user.key}-${Date.now()}`,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
            refreshToken: `mock-refresh-${user.key}-${Date.now()}`,
            id: user.id,
            name: user.name,
            email: user.email,
            employeeNumber: user.employeeNumber,
            status: '재직중',
        };
    }

    /**
     * Mock 비밀번호 확인
     */
    async checkPassword(
        token: string,
        currentPassword: string,
        email?: string,
    ): Promise<boolean> {
        if (email) {
            const user = this.findByEmail(email);
            return user?.password === currentPassword;
        }
        return currentPassword === TEST_PASSWORD;
    }

    // ─── 조직 정보 메서드 ────────────────────────────────

    /**
     * Mock 직원 정보 조회 (단일)
     */
    async getEmployee(params: {
        employeeId?: string;
        employeeNumber?: string;
        withDetail?: boolean;
    }): Promise<Employee> {
        let user: MockUser | undefined;

        if (params.employeeNumber) {
            user = this.findByEmployeeNumber(params.employeeNumber);
        } else if (params.employeeId) {
            user = this.findById(params.employeeId);
        }

        if (!user) {
            throw new Error(
                `[Mock] 직원을 찾을 수 없습니다: ${JSON.stringify(params)}. ` +
                `사용 가능한 사번: ${MOCK_USERS.map((u) => u.employeeNumber).join(', ')}`,
            );
        }

        this.logger.debug(`[Mock] 직원 조회: ${user.name} (${user.employeeNumber})`);
        return this.toEmployee(user);
    }

    /**
     * Mock 직원 정보 조회 (다수)
     */
    async getEmployees(params?: {
        identifiers?: string[];
        withDetail?: boolean;
        includeTerminated?: boolean;
    }): Promise<GetEmployeesResponse> {
        let users = MOCK_USERS;
        if (params?.identifiers?.length) {
            users = MOCK_USERS.filter(
                (u) =>
                    params.identifiers!.includes(u.id) ||
                    params.identifiers!.includes(u.employeeNumber),
            );
        }

        return {
            employees: users.map((u) => this.toEmployee(u)),
            total: users.length,
        };
    }

    /**
     * Mock 부서 계층구조 조회
     */
    async getDepartmentHierarchy(params?: {
        rootDepartmentId?: string;
        maxDepth?: number;
        withEmployeeDetail?: boolean;
        includeTerminated?: boolean;
        includeEmptyDepartments?: boolean;
    }): Promise<GetDepartmentHierarchyResponse> {
        this.logger.warn(
            '[Mock] getDepartmentHierarchy: Mock 모드에서는 빈 결과를 반환합니다.',
        );
        return { departments: [], totalDepartments: 0, totalEmployees: 0, maxDepth: 0 };
    }

    /**
     * Mock 매니저 정보 조회
     */
    async getEmployeesManagers(): Promise<GetEmployeesManagersResponse> {
        this.logger.warn(
            '[Mock] getEmployeesManagers: Mock 모드에서는 빈 결과를 반환합니다.',
        );
        return { employees: [], total: 0 };
    }

    /**
     * Mock 전체 조직 데이터 내보내기
     */
    async exportAllData(params?: {
        includeTerminated?: boolean;
        includeInactiveDepartments?: boolean;
    }): Promise<ExportAllDataResponse> {
        this.logger.warn(
            '[Mock] exportAllData: Mock 모드에서는 빈 결과를 반환합니다. (마이그레이션 불필요)',
        );
        return {
            departments: [],
            employees: [],
            positions: [],
            ranks: [],
            employeeDepartmentPositions: [],
            assignmentHistories: [],
            totalCounts: {
                departments: 0,
                employees: 0,
                positions: 0,
                ranks: 0,
                employeeDepartmentPositions: 0,
                assignmentHistories: 0,
            },
            exportedAt: new Date().toISOString(),
        };
    }
}
