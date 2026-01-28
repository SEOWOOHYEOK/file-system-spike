import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

/**
 * Role API Swagger 데코레이터
 */

export const CreateRoleSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '새로운 Role 생성',
      description: `
Role을 생성합니다.

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름의 Role이 이미 존재함 시 에러 (기본값)
- \`RENAME\`: 자동 이름 변경 (예: role(1))
- \`SKIP\`: 생성 건너뛰기
      `
    }),
    ApiParam({
      name: 'name',
      description: 'Role 이름',
      example: 'admin',
    }),
    ApiParam({
      name: 'description',
      description: 'Role 설명',
      example: '관리자 권한',
    }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Role 이름' },
          description: { type: 'string', description: 'Role 설명 (선택)' },
          permissionCodes: {
            type: 'array',
            items: { type: 'string' },
            description: '권한 코드 목록',
          },
        },
        required: ['name', 'permissionCodes'],
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Role 생성 완료',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Role ID' },
          name: { type: 'string', description: 'Role 이름' },
          description: { type: 'string', description: 'Role 설명' },
          permissions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', description: '권한 코드' },
                description: { type: 'string', description: '권한 설명' },
              },
            },
            description: '권한 목록',
          },
        },
      },
    }),
    ApiResponse({
      status: 409,
      description: '동일한 이름의 Role이 이미 존재함',
    }),
  );

export const FindAllRolesSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '전체 Role 목록 조회',
      description: `
Role 목록을 조회합니다.
      `
    }),
    ApiResponse({
      status: 200,
      description: 'Role 목록 반환',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Role ID' },
            name: { type: 'string', description: 'Role 이름' },
            description: { type: 'string', description: 'Role 설명' },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', description: '권한 코드' },
                  description: { type: 'string', description: '권한 설명' },
                },
              },
              description: '권한 목록',
            },
          },
        },
      },
    }),
  );

export const FindRoleByIdSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '특정 Role 조회 (ID 기준)',
      description: `
Role을 조회합니다.
      `
    }),
    ApiParam({ name: 'id', description: 'Role ID' }),
    ApiResponse({
      status: 200,
      description: 'Role 정보 반환 (권한 포함)',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Role ID' },
          name: { type: 'string', description: 'Role 이름' },
          description: { type: 'string', description: 'Role 설명' },
          permissions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', description: '권한 코드' },
                description: { type: 'string', description: '권한 설명' },
              },
            },
            description: '권한 목록',
          },
        },
      },
    }),
    ApiResponse({
      status: 404,
      description: 'Role을 찾을 수 없음',
    }),
  );

export const DeleteRoleSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Role 삭제',
      description: `
Role을 삭제합니다.
      `
    }),
    ApiParam({ name: 'id', description: 'Role ID' }),
    ApiResponse({
      status: 200,
      description: 'Role 삭제 완료',
    }),
    ApiResponse({
      status: 404,
      description: 'Role을 찾을 수 없음',
    }),
  );
