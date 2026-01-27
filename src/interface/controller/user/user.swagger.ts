import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

/**
 * User API Swagger 데코레이터
 */

export const FindAllUsersSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: '전체 User 목록 조회' }),
    ApiResponse({
      status: 200,
      description: 'User 목록 반환',
    }),
  );

export const FindUserByIdSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: '특정 User 조회 (Role 포함)' }),
    ApiParam({ name: 'id', description: 'User ID (Employee ID와 동일)' }),
    ApiResponse({
      status: 200,
      description: 'User 정보 반환 (Role, Permission 포함)',
    }),
    ApiResponse({
      status: 404,
      description: 'User를 찾을 수 없음',
    }),
  );

export const AssignRoleSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'User에게 Role 부여' }),
    ApiParam({ name: 'id', description: 'User ID' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          roleId: { type: 'string', description: '부여할 Role ID' },
        },
        required: ['roleId'],
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Role 부여 완료',
    }),
    ApiResponse({
      status: 404,
      description: 'User 또는 Role을 찾을 수 없음',
    }),
    ApiResponse({
      status: 400,
      description: '비활성 User에게 Role 부여 불가',
    }),
  );

export const RemoveRoleSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'User의 Role 제거' }),
    ApiParam({ name: 'id', description: 'User ID' }),
    ApiResponse({
      status: 200,
      description: 'Role 제거 완료',
    }),
    ApiResponse({
      status: 404,
      description: 'User를 찾을 수 없음',
    }),
  );

export const SyncUsersSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'Employee → User 동기화 실행' }),
    ApiResponse({
      status: 200,
      description: '동기화 결과 반환',
      schema: {
        type: 'object',
        properties: {
          created: { type: 'number', description: '생성된 User 수' },
          activated: { type: 'number', description: '재활성화된 User 수' },
          deactivated: { type: 'number', description: '비활성화된 User 수' },
          skipped: { type: 'number', description: '건너뛴 수' },
          unchanged: { type: 'number', description: '변경 없는 User 수' },
          processingTimeMs: { type: 'number', description: '처리 시간 (ms)' },
        },
      },
    }),
  );
