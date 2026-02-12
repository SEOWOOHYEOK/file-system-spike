import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { PermissionEnum } from '../../../../domain/role/permission.enum';

/**
 * Role-Permission API Swagger 데코레이터
 */

const rolePermissionSchema = {
  type: 'object' as const,
  properties: {
    roleId: { type: 'string', format: 'uuid', description: '역할 ID' },
    roleName: { type: 'string', description: '역할 이름', example: 'ADMIN' },
    roleDescription: { type: 'string', description: '역할 설명', example: '관리자' },
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '권한 코드', example: 'FILE_READ' },
          description: { type: 'string', description: '권한 설명', example: '파일 조회/검색' },
        },
      },
      description: '해당 역할의 권한 목록',
    },
  },
};

const permissionCategorySchema = {
  type: 'object' as const,
  properties: {
    category: { type: 'string', description: '카테고리 이름', example: 'File Management' },
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '권한 코드', example: 'FILE_READ' },
          description: { type: 'string', description: '권한 설명', example: '파일 조회/검색' },
        },
      },
    },
  },
};

/**
 * GET /role-permissions - 전체 역할별 권한 매트릭스 조회
 */
export const FindAllRolePermissionsSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '전체 역할별 권한 매트릭스 조회',
      description: `
시스템에 등록된 모든 역할과 각 역할에 부여된 권한 목록을 조회합니다.

### 응답 구조
- 각 역할(Admin, Manager, User, Guest)별로 부여된 권한 코드와 설명을 반환합니다.
- 프론트엔드 관리 화면에서 역할별 권한 매트릭스를 표시하는 데 사용됩니다.
      `,
    }),
    ApiResponse({
      status: 200,
      description: '역할별 권한 매트릭스 반환',
      schema: {
        type: 'array',
        items: rolePermissionSchema,
      },
    }),
  );

/**
 * GET /role-permissions/:roleId - 특정 역할의 권한 목록 조회
 */
export const FindRolePermissionsSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '특정 역할의 권한 목록 조회',
      description: '역할 ID로 해당 역할에 부여된 권한 목록을 조회합니다.',
    }),
    ApiParam({ name: 'roleId', description: '역할 ID (UUID)', format: 'uuid' }),
    ApiResponse({
      status: 200,
      description: '역할 권한 정보 반환',
      schema: rolePermissionSchema,
    }),
    ApiResponse({
      status: 404,
      description: '역할을 찾을 수 없음',
    }),
  );

/**
 * POST /role-permissions/:roleId/permissions - 역할에 권한 추가
 */
export const AddPermissionToRoleSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '역할에 권한 추가',
      description: `
특정 역할에 새로운 권한을 추가합니다.

- 이미 부여된 권한을 다시 추가하면 409 에러가 발생합니다.
- 존재하지 않는 권한 코드를 지정하면 404 에러가 발생합니다.
      `,
    }),
    ApiParam({ name: 'roleId', description: '역할 ID (UUID)', format: 'uuid' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['permissionCode'],
        properties: {
          permissionCode: {
            type: 'string',
            enum: Object.values(PermissionEnum),
            description: '추가할 권한 코드',
            example: 'FILE_READ',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: '권한 추가 완료 - 업데이트된 역할 정보 반환',
      schema: rolePermissionSchema,
    }),
    ApiResponse({
      status: 404,
      description: '역할 또는 권한을 찾을 수 없음',
    }),
    ApiResponse({
      status: 409,
      description: '이미 해당 역할에 부여된 권한',
    }),
  );

/**
 * DELETE /role-permissions/:roleId/permissions/:permissionCode - 역할에서 권한 제거
 */
export const RemovePermissionFromRoleSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '역할에서 권한 제거',
      description: `
특정 역할에서 권한을 제거합니다.

- 해당 역할에 부여되지 않은 권한을 제거하려 하면 404 에러가 발생합니다.
      `,
    }),
    ApiParam({ name: 'roleId', description: '역할 ID (UUID)', format: 'uuid' }),
    ApiParam({
      name: 'permissionCode',
      description: '제거할 권한 코드',
      enum: PermissionEnum,
      example: 'FILE_READ',
    }),
    ApiResponse({
      status: 200,
      description: '권한 제거 완료 - 업데이트된 역할 정보 반환',
      schema: rolePermissionSchema,
    }),
    ApiResponse({
      status: 404,
      description: '역할을 찾을 수 없거나 해당 권한이 부여되지 않음',
    }),
  );

/**
 * GET /permissions - 시스템 전체 권한 목록 조회
 */
export const FindAllPermissionsSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '시스템 전체 권한 목록 조회 (카테고리별)',
      description: `
시스템에 등록된 전체 권한 목록을 카테고리별로 그룹핑하여 조회합니다.

### 카테고리
| 카테고리 | Prefix | 설명 |
|----------|--------|------|
| User Management | USER_* | 사용자 관리 |
| Role Management | ROLE_* | 역할 관리 |
| Audit & Monitoring | AUDIT_*, SYSTEM_*, SYNC_* | 감사/모니터링 |
| File Management | FILE_READ/WRITE/DELETE/UPLOAD/DOWNLOAD/MOVE | 파일 기본 관리 |
| File Request/Approval | FILE_*_REQUEST, FILE_*_APPROVE | 파일 요청/승인 워크플로우 |
| Trash & Recovery | TRASH_*, FILE_PURGE, FILE_RESTORE | 삭제/복구 |
| Share Management | FILE_SHARE_*, SHARE_LOG_* | 공유 관리 |
| External Share Access | EXTERNAL_SHARE_* | 외부 공유 접근 |
| Folder Management | FOLDER_* | 폴더 관리 |
      `,
    }),
    ApiResponse({
      status: 200,
      description: '카테고리별 권한 목록 반환',
      schema: {
        type: 'array',
        items: permissionCategorySchema,
      },
    }),
  );
