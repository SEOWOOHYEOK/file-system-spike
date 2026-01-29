/**
 * Sync Event Controller Swagger 데코레이터
 * 동기화 이벤트 상태 조회 API 문서
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

/**
 * 동기화 이벤트 상태 조회 API 문서
 */
export const ApiSyncEventStatus = () =>
  applyDecorators(
    ApiOperation({
      summary: '동기화 이벤트 상태 조회',
      description: `
동기화 이벤트의 현재 상태를 조회합니다.

### 상태값
- \`PENDING\`: 대기 중
- \`PROCESSING\`: 처리 중
- \`DONE\`: 완료
- \`FAILED\`: 실패

### 용도
- 파일 업로드 후 NAS 동기화 진행률 확인
- 파일 이동/이름변경 후 NAS 반영 상태 확인
      `,
    }),
    ApiParam({
      name: 'syncEventId',
      description: '동기화 이벤트 ID',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    ApiResponse({
      status: 200,
      description: '동기화 이벤트 상태 조회 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
          eventType: {
            type: 'string',
            enum: ['CREATE', 'MOVE', 'DELETE', 'RENAME', 'TRASH', 'RESTORE', 'PURGE'],
            example: 'CREATE',
          },
          targetType: {
            type: 'string',
            enum: ['FILE', 'FOLDER'],
            example: 'FILE',
          },
          status: {
            type: 'string',
            enum: ['PENDING', 'PROCESSING', 'DONE', 'FAILED'],
            example: 'PROCESSING',
          },
          progress: { type: 'number', example: 75, description: '진행률 (0-100)' },
          retryCount: { type: 'number', example: 0 },
          errorMessage: { type: 'string', nullable: true },
          createdAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
          processedAt: { type: 'string', nullable: true, example: '2024-01-23T10:01:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '동기화 이벤트를 찾을 수 없음' }),
  );

/**
 * 파일 동기화 상태 조회 API 문서
 */
export const ApiFileSyncStatus = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 동기화 상태 조회',
      description: `
파일의 현재 스토리지 상태와 활성 동기화 이벤트를 조회합니다.

### 스토리지 상태
- \`AVAILABLE\`: 사용 가능
- \`SYNCING\`: 동기화 중
- \`MISSING\`: 누락
- \`ERROR\`: 오류

### 용도
- 파일 다운로드 가능 여부 확인
- NAS 동기화 완료 여부 확인
      `,
    }),
    ApiParam({
      name: 'fileId',
      description: '파일 ID',
      example: 'file_abc123',
    }),
    ApiResponse({
      status: 200,
      description: '파일 동기화 상태 조회 성공',
      schema: {
        type: 'object',
        properties: {
          fileId: { type: 'string', example: 'file_abc123' },
          storageStatus: {
            type: 'object',
            properties: {
              cache: {
                type: 'string',
                enum: ['AVAILABLE', 'MISSING'],
                example: 'AVAILABLE',
              },
              nas: {
                type: 'string',
                enum: ['AVAILABLE', 'SYNCING', 'ERROR'],
                example: 'SYNCING',
              },
            },
          },
          activeSyncEvent: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
              eventType: { type: 'string', example: 'CREATE' },
              status: { type: 'string', example: 'PROCESSING' },
              progress: { type: 'number', example: 75 },
              createdAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: '파일을 찾을 수 없음' }),
  );
