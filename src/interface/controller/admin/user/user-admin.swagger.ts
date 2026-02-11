/**
 * User Admin Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';

/**
 * GET /v1/admin/users - 전체 User 목록 조회 API 문서
 */
export const ApiFindAllUsers = () =>
  applyDecorators(
    ApiOperation({
      summary: '전체 User 목록 조회 (Employee 정보 포함)',
      description: `
DMS 시스템에 등록된 전체 User 목록을 Employee 정보와 함께 조회합니다.

### User-Employee 관계
- User와 Employee는 **1:1 매핑**이며, 동일한 ID를 사용합니다.
- Employee 동기화(\`POST /v1/admin/users/sync\`)를 통해 User가 생성됩니다.

### 필터링
- 모든 필터는 선택 사항(Optional)이며, 조합하여 사용할 수 있습니다.
- \`employeeName\`, \`employeeNumber\`는 **부분 일치(LIKE)** 검색입니다.
- \`status\`는 **정확히 일치(Equal)** 검색입니다.

### 재직 상태 (status)
| 값 | 설명 |
|---|---|
| \`재직중\` | 현재 근무 중인 직원 |
| \`휴직\` | 일시적으로 업무를 중단한 직원 |
| \`퇴사\` | 퇴사한 직원 |

### 응답 필드 설명
| 필드 | 설명 |
|---|---|
| \`id\` | User ID (= Employee ID) |
| \`isActive\` | 활성 상태. 재직중이면 true, 퇴사/휴직이면 false |
| \`roleId\` | 부여된 Role의 ID. 미부여 시 null |
| \`employeeName\` | 직원 이름 |
| \`employeeNumber\` | 사번 |
| \`departmentName\` | 소속 부서명 |
| \`positionName\` | 직급명 |
| \`status\` | 재직 상태 |
      `,
    }),
    ApiQuery({
      name: 'employeeName',
      required: false,
      type: String,
      description: '직원 이름 (부분 일치 검색)',
      example: '홍길동',
    }),
    ApiQuery({
      name: 'employeeNumber',
      required: false,
      type: String,
      description: '사번 (부분 일치 검색)',
      example: 'EMP001',
    }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: ['재직중', '휴직', '퇴사'],
      description: '재직 상태 필터',
    }),
    ApiOkResponse({
      description: 'User + Employee 목록 반환',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'User ID (= Employee ID)',
              example: 'emp-uuid-001',
            },
            isActive: {
              type: 'boolean',
              description: '활성 상태',
              example: true,
            },
            roleId: {
              type: 'string',
              description: '부여된 Role ID. 미부여 시 null',
              example: 'role-uuid-admin',
              nullable: true,
            },
            employeeName: {
              type: 'string',
              description: '직원 이름',
              example: '홍길동',
            },
            employeeNumber: {
              type: 'string',
              description: '사번',
              example: 'EMP001',
            },
            departmentName: {
              type: 'string',
              description: '소속 부서명',
              example: '개발팀',
            },
            positionName: {
              type: 'string',
              description: '직급명',
              example: '선임연구원',
            },
            status: {
              type: 'string',
              description: '재직 상태',
              example: '재직중',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'User 생성일시',
              example: '2026-01-15T09:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: '최종 수정일시',
              example: '2026-02-10T14:30:00.000Z',
            },
          },
        },
      },
    }),
  );

/**
 * GET /v1/admin/users/:id - 특정 User 조회 API 문서
 */
export const ApiFindUserById = () =>
  applyDecorators(
    ApiOperation({
      summary: '특정 User 조회 (Role 포함)',
      description: `
User ID로 특정 사용자의 상세 정보를 조회합니다. Role과 Permission 정보가 함께 반환됩니다.

### 기본 역할 자동 할당
- Role이 없는 **활성** 사용자에게는 기본 \`USER\` 역할이 자동 할당됩니다.
- 비활성 사용자는 자동 할당 대상에서 제외됩니다.
- 기본 역할이 시스템에 없는 경우 \`role: null\`이 반환됩니다.

### 응답 구조
| 필드 | 설명 |
|---|---|
| \`id\` | User ID |
| \`isActive\` | 활성 상태 |
| \`role\` | Role 정보 (없으면 null) |
| \`role.id\` | Role ID |
| \`role.name\` | Role 이름 (예: ADMIN, USER) |
| \`role.permissions\` | 권한 코드 목록 (예: ["FILE_READ", "FILE_WRITE"]) |
      `,
    }),
    ApiParam({
      name: 'id',
      description: 'User ID (= Employee ID)',
      example: 'emp-uuid-001',
    }),
    ApiOkResponse({
      description: 'User 상세 정보 반환 (Role, Permission 포함)',
      schema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'User ID',
            example: 'emp-uuid-001',
          },
          isActive: {
            type: 'boolean',
            description: '활성 상태',
            example: true,
          },
          role: {
            type: 'object',
            nullable: true,
            description: 'Role 정보. Role 미부여 시 null',
            properties: {
              id: {
                type: 'string',
                description: 'Role ID',
                example: 'role-uuid-admin',
              },
              name: {
                type: 'string',
                description: 'Role 이름',
                example: 'ADMIN',
              },
              permissions: {
                type: 'array',
                items: { type: 'string' },
                description: '권한 코드 목록',
                example: ['FILE_READ', 'FILE_WRITE', 'FILE_DELETE', 'ADMIN_ACCESS'],
              },
            },
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'User 생성일시',
            example: '2026-01-15T09:00:00.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: '최종 수정일시',
            example: '2026-02-10T14:30:00.000Z',
          },
        },
        required: ['id', 'isActive', 'role', 'createdAt', 'updatedAt'],
      },
    }),
    ApiResponse({
      status: 404,
      description: 'User를 찾을 수 없음',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 404 },
          message: { type: 'string', example: 'User를 찾을 수 없습니다.' },
          error: { type: 'string', example: 'Not Found' },
        },
      },
    }),
  );

/**
 * PATCH /v1/admin/users/:id/role - User에게 Role 부여 API 문서
 */
export const ApiAssignRole = () =>
  applyDecorators(
    ApiOperation({
      summary: 'User에게 Role 부여',
      description: `
특정 User에게 Role을 부여합니다. 기존 Role이 있는 경우 새 Role로 교체됩니다.

### 전제 조건
- 대상 User가 **활성(isActive: true)** 상태여야 합니다.
- 비활성 User에게는 Role을 부여할 수 없습니다 (400 에러).
- 부여할 Role이 시스템에 존재해야 합니다 (404 에러).

### Role 부여 동작
| 기존 상태 | 동작 |
|---|---|
| Role 없음 | 새 Role 부여 |
| 동일 Role | 그대로 유지 (업데이트 시각만 갱신) |
| 다른 Role | 기존 Role 제거 후 새 Role 부여 |

### 감사 로그
이 API는 \`USER_ROLE_ASSIGN\` 감사 로그를 자동 기록합니다.
      `,
    }),
    ApiParam({
      name: 'id',
      description: 'Role을 부여할 User ID',
      example: 'emp-uuid-001',
    }),
    ApiBody({
      description: '부여할 Role 정보',
      schema: {
        type: 'object',
        properties: {
          roleId: {
            type: 'string',
            description: '부여할 Role의 ID',
            example: 'role-uuid-admin',
          },
        },
        required: ['roleId'],
      },
    }),
    ApiOkResponse({
      description: 'Role 부여 완료. 업데이트된 User 정보 반환',
      schema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'User ID',
            example: 'emp-uuid-001',
          },
          roleId: {
            type: 'string',
            description: '부여된 Role ID',
            example: 'role-uuid-admin',
          },
          isActive: {
            type: 'boolean',
            description: '활성 상태',
            example: true,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: '생성일시',
            example: '2026-01-15T09:00:00.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: '수정일시 (Role 부여 시각으로 갱신)',
            example: '2026-02-11T10:00:00.000Z',
          },
        },
        required: ['id', 'roleId', 'isActive', 'createdAt', 'updatedAt'],
      },
    }),
    ApiResponse({
      status: 400,
      description: '비활성 User에게 Role 부여 불가',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 400 },
          message: { type: 'string', example: '비활성 사용자에게는 Role을 부여할 수 없습니다.' },
          error: { type: 'string', example: 'Bad Request' },
        },
      },
    }),
    ApiResponse({
      status: 404,
      description: 'User 또는 Role을 찾을 수 없음',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 404 },
          message: { type: 'string', example: 'User를 찾을 수 없습니다.' },
          error: { type: 'string', example: 'Not Found' },
        },
      },
    }),
  );

/**
 * DELETE /v1/admin/users/:id/role - User의 Role 제거 API 문서
 */
export const ApiRemoveRole = () =>
  applyDecorators(
    ApiOperation({
      summary: 'User의 Role 제거',
      description: `
특정 User의 Role을 제거합니다. 제거 후 \`roleId\`는 null이 됩니다.

### 동작 설명
- Role이 이미 없는 경우에도 에러 없이 정상 처리됩니다.
- Role 제거 후에도 User 계정은 유지됩니다 (삭제되지 않음).
- 다음 로그인 시 기본 \`USER\` 역할이 자동 할당될 수 있습니다.

### 주의 사항
- Role 제거 즉시 해당 User의 기존 권한이 무효화됩니다.
- 현재 세션이 유지 중인 경우 토큰 만료 전까지는 기존 권한으로 동작할 수 있습니다.

### 감사 로그
이 API는 \`USER_ROLE_REMOVE\` 감사 로그를 자동 기록합니다.
      `,
    }),
    ApiParam({
      name: 'id',
      description: 'Role을 제거할 User ID',
      example: 'emp-uuid-001',
    }),
    ApiOkResponse({
      description: 'Role 제거 완료. 업데이트된 User 정보 반환',
      schema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'User ID',
            example: 'emp-uuid-001',
          },
          roleId: {
            type: 'string',
            description: 'Role ID (제거 후 null)',
            example: null,
            nullable: true,
          },
          isActive: {
            type: 'boolean',
            description: '활성 상태',
            example: true,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: '생성일시',
            example: '2026-01-15T09:00:00.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: '수정일시 (Role 제거 시각으로 갱신)',
            example: '2026-02-11T10:00:00.000Z',
          },
        },
        required: ['id', 'roleId', 'isActive', 'createdAt', 'updatedAt'],
      },
    }),
    ApiResponse({
      status: 404,
      description: 'User를 찾을 수 없음',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 404 },
          message: { type: 'string', example: 'User를 찾을 수 없습니다.' },
          error: { type: 'string', example: 'Not Found' },
        },
      },
    }),
  );

/**
 * POST /v1/admin/users/sync - Employee → User 동기화 API 문서
 */
export const ApiSyncUsers = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Employee → User 동기화 실행',
      description: `
Employee 데이터를 기반으로 User를 일괄 동기화합니다. 관리자가 수동으로 트리거합니다.

### 동기화 규칙
| Employee 상태 | User 존재 여부 | 처리 |
|---|---|---|
| 재직중 | User 없음 | 새 User 생성 (isActive: true, roleId: null) |
| 휴직/퇴사 | User 없음 | User 생성 **안 함** (skipped) |
| 재직중 | 비활성 User | User 재활성화 (isActive: true) |
| 휴직/퇴사 | 활성 User | User 비활성화 (isActive: false) |
| 재직중 | 활성 User | 변경 없음 (unchanged) |
| 휴직/퇴사 | 비활성 User | 변경 없음 (unchanged) |

### 중요 동작
- **Role은 유지됩니다.** 비활성화 시에도 기존 Role은 제거되지 않습니다.
- 동기화는 **전체 Employee** 를 대상으로 실행됩니다 (부분 동기화 미지원).
- 변경이 있는 User만 DB에 저장됩니다 (성능 최적화).

### 응답 필드 설명
| 필드 | 설명 |
|---|---|
| \`created\` | 새로 생성된 User 수 |
| \`activated\` | 비활성 → 활성으로 변경된 User 수 (복직) |
| \`deactivated\` | 활성 → 비활성으로 변경된 User 수 (퇴사/휴직) |
| \`skipped\` | User 생성을 건너뛴 수 (퇴사/휴직 상태 신규 Employee) |
| \`unchanged\` | 상태 변경이 없는 User 수 |
| \`processingTimeMs\` | 전체 처리 시간 (밀리초) |

### 감사 로그
이 API는 \`USER_SYNC\` 감사 로그를 자동 기록합니다.
      `,
    }),
    ApiOkResponse({
      description: '동기화 결과 반환',
      schema: {
        type: 'object',
        properties: {
          created: {
            type: 'number',
            description: '새로 생성된 User 수',
            example: 5,
          },
          activated: {
            type: 'number',
            description: '재활성화된 User 수 (복직)',
            example: 1,
          },
          deactivated: {
            type: 'number',
            description: '비활성화된 User 수 (퇴사/휴직)',
            example: 2,
          },
          skipped: {
            type: 'number',
            description: '생성 건너뛴 수 (퇴사/휴직 상태 신규)',
            example: 0,
          },
          unchanged: {
            type: 'number',
            description: '변경 없는 User 수',
            example: 142,
          },
          processingTimeMs: {
            type: 'number',
            description: '처리 시간 (밀리초)',
            example: 1250,
          },
        },
        required: ['created', 'activated', 'deactivated', 'skipped', 'unchanged', 'processingTimeMs'],
      },
    }),
    ApiResponse({
      status: 500,
      description: '동기화 처리 중 내부 오류 (DB 연결 실패, Employee 조회 실패 등)',
    }),
  );
