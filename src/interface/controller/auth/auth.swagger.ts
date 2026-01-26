/**
 * Auth Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
    ApiOperation,
    ApiBody,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';

/**
 * 로그인 API 문서
 */
export const ApiLogin = () =>
    applyDecorators(
        ApiOperation({
            summary: 'SSO 로그인',
            description: `
SSO를 통해 로그인하고 JWT 토큰을 발급합니다.

### 응답
- \`success\`: 성공 여부
- \`token\`: API 호출에 사용할 JWT 토큰
- \`user\`: 사용자 정보 (id, employeeNumber, name, email)
- \`ssoToken\`: SSO 토큰 정보 (accessToken, refreshToken)
            `,
        }),
        ApiBody({
            description: '로그인 정보',
            schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: {
                        type: 'string',
                        format: 'email',
                        description: '이메일 주소',
                        example: 'user@example.com',
                    },
                    password: {
                        type: 'string',
                        description: '비밀번호',
                        example: 'password123',
                    },
                },
            },
        }),
        ApiResponse({
            status: 200,
            description: '로그인 성공',
            schema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                    user: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', example: 'emp_abc123' },
                            employeeNumber: { type: 'string', example: 'EMP001' },
                            name: { type: 'string', example: '홍길동' },
                            email: { type: 'string', example: 'user@example.com' },
                        },
                    },
                    ssoToken: {
                        type: 'object',
                        properties: {
                            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                            refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        },
                    },
                },
            },
        }),
        ApiResponse({ status: 401, description: '인증 실패 (이메일 또는 비밀번호 오류)' }),
    );

/**
 * 토큰 생성 API 문서
 */
export const ApiGenerateToken = () =>
    applyDecorators(
        ApiOperation({
            summary: 'JWT 토큰 생성',
            description: `
만료시간 없이 유효한 JWT 토큰을 생성합니다.
테스트 및 개발 용도로 사용합니다.
            `,
        }),
        ApiBody({
            description: '토큰 생성 정보',
            schema: {
                type: 'object',
                required: ['employeeNumber'],
                properties: {
                    employeeNumber: {
                        type: 'string',
                        description: '직원 번호',
                        example: 'TEST001',
                    },
                    name: {
                        type: 'string',
                        description: '이름',
                        example: '테스트 사용자',
                    },
                    email: {
                        type: 'string',
                        description: '이메일',
                        example: 'test@example.com',
                    },
                    additionalData: {
                        type: 'object',
                        description: '추가 payload 데이터',
                        example: { role: 'admin', department: 'IT' },
                    },
                },
            },
        }),
        ApiResponse({
            status: 200,
            description: '토큰 생성 성공',
            schema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                    tokenInfo: {
                        type: 'object',
                        properties: {
                            employeeNumber: { type: 'string', example: 'TEST001' },
                            name: { type: 'string', example: '테스트 사용자' },
                            email: { type: 'string', example: 'test@example.com' },
                            issuedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
                            expiresAt: { type: 'string', nullable: true },
                        },
                    },
                    usage: { type: 'string', example: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                },
            },
        }),
        ApiResponse({ status: 400, description: '토큰 생성 실패' }),
    );

/**
 * 토큰 검증 API 문서
 */
export const ApiVerifyToken = () =>
    applyDecorators(
        ApiOperation({
            summary: 'JWT 토큰 검증',
            description: `
JWT 토큰의 유효성을 검증하고 payload를 반환합니다.

### 응답
- \`valid\`: 토큰 유효 여부
- \`payload\`: 토큰이 유효한 경우 payload 정보
- \`error\`: 검증 실패 시 오류 메시지
- \`expired\`: 토큰 만료 여부
            `,
        }),
        ApiBody({
            description: '검증할 토큰',
            schema: {
                type: 'object',
                required: ['token'],
                properties: {
                    token: {
                        type: 'string',
                        description: '검증할 JWT 토큰',
                        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                    },
                },
            },
        }),
        ApiResponse({
            status: 200,
            description: '토큰 검증 결과 (유효한 경우)',
            schema: {
                type: 'object',
                properties: {
                    valid: { type: 'boolean', example: true },
                    payload: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', example: 'emp_abc123' },
                            employeeNumber: { type: 'string', example: 'EMP001' },
                            name: { type: 'string', example: '홍길동' },
                            email: { type: 'string', example: 'user@example.com' },
                            iat: { type: 'number', example: 1706000000 },
                            exp: { type: 'number', example: 1706003600 },
                        },
                    },
                },
            },
        }),
    );

/**
 * 조직 데이터 마이그레이션 API 문서
 */
export const ApiMigrateOrganization = () =>
    applyDecorators(
        ApiOperation({
            summary: '조직 데이터 마이그레이션',
            description: `
SSO에서 모든 조직 데이터를 가져옵니다.

### 조회되는 데이터
- \`ranks\`: 직급 목록
- \`positions\`: 직책 목록
- \`departments\`: 부서 목록 (계층 구조)
- \`employees\`: 직원 목록
- \`employeeDepartmentPositions\`: 직원-부서-직책 배정 정보
- \`assignmentHistories\`: 발령 이력
            `,
        }),
        ApiBody({
            description: '마이그레이션 옵션',
            schema: {
                type: 'object',
                properties: {
                    includeTerminated: {
                        type: 'boolean',
                        description: '퇴사자 포함 여부',
                        example: false,
                        default: false,
                    },
                    includeInactiveDepartments: {
                        type: 'boolean',
                        description: '비활성 부서 포함 여부',
                        example: false,
                        default: false,
                    },
                },
            },
        }),
        ApiResponse({
            status: 200,
            description: '마이그레이션 성공',
            schema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    statistics: {
                        type: 'object',
                        properties: {
                            ranks: { type: 'number', example: 10 },
                            positions: { type: 'number', example: 15 },
                            departments: { type: 'number', example: 50 },
                            employees: { type: 'number', example: 200 },
                            employeeDepartmentPositions: { type: 'number', example: 180 },
                            assignmentHistories: { type: 'number', example: 500 },
                        },
                    },
                    data: {
                        type: 'object',
                        description: 'SSO에서 조회한 조직 데이터',
                    },
                },
            },
        }),
        ApiResponse({ status: 400, description: '마이그레이션 실패' }),
    );
