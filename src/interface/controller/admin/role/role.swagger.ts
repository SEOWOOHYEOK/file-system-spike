import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

/**
 * Role API Swagger 데코레이터
 */

export const CreateRoleSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '새로운 Role 생성',
      description: `
새로운 역할(Role)을 생성합니다.

- 동일한 이름의 Role이 이미 존재하면 409 에러가 발생합니다.
- permissionCodes에 유효한 권한 코드를 전달해야 합니다.
      `,
    }),
    ApiResponse({
      status: 201,
      description: 'Role 생성 완료',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Role ID' },
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
      description: '시스템에 등록된 모든 역할(Role) 목록을 조회합니다.',
    }),
    ApiResponse({
      status: 200,
      description: 'Role 목록 반환',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Role ID' },
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
      description: 'ID로 특정 역할(Role)을 조회합니다. 권한 목록을 포함하여 반환합니다.',
    }),
    ApiParam({ name: 'id', description: 'Role ID (UUID)', format: 'uuid' }),
    ApiResponse({
      status: 200,
      description: 'Role 정보 반환 (권한 포함)',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Role ID' },
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
      description: 'ID로 특정 역할(Role)을 삭제합니다.',
    }),
    ApiParam({ name: 'id', description: 'Role ID (UUID)', format: 'uuid' }),
    ApiResponse({
      status: 200,
      description: 'Role 삭제 완료',
    }),
    ApiResponse({
      status: 404,
      description: 'Role을 찾을 수 없음',
    }),
  );

export const GetUserPermissionsSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: '사용자 권한 목록 조회',
      description: '특정 사용자에게 부여된 모든 권한 코드 목록을 조회합니다. 사용자의 모든 역할에서 중복 없이 취합합니다.',
    }),
    ApiParam({ name: 'userId', description: '사용자 ID (UUID)', format: 'uuid' }),
    ApiResponse({
      status: 200,
      description: '권한 코드 목록 반환',
      schema: {
        type: 'array',
        items: {
          type: 'string',
          example: 'FILE_READ',
        },
        description: '권한 코드 목록 (예: ["FILE_READ", "FILE_WRITE", "FOLDER_READ"])',
      },
    }),
  );
