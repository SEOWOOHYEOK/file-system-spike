/**
 * Multipart Upload Controller Swagger 데코레이터
 * 대용량 파일 멀티파트 업로드 API 문서
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

/**
 * 멀티파트 업로드 초기화 API 문서
 */
export const ApiMultipartInitiate = () =>
  applyDecorators(
    ApiOperation({
      summary: '멀티파트 업로드 초기화',
      description: `
대용량 파일 (100MB 이상) 업로드를 시작합니다.

### 프로세스
1. 이 API를 호출하여 업로드 세션을 생성합니다.
2. 반환된 sessionId와 partSize를 사용하여 파트별로 업로드합니다.
3. 모든 파트 업로드 후 complete API를 호출합니다.

### 세션 만료
- 세션은 24시간 후 만료됩니다.
- 만료된 세션은 재사용할 수 없습니다.

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름 파일 존재 시 에러 (기본값)
- \`RENAME\`: 자동 이름 변경 (예: file(1).txt)
      `,
    }),
    ApiBody({
      description: '업로드할 파일 정보',
      schema: {
        type: 'object',
        required: ['fileName', 'folderId', 'totalSize', 'mimeType'],
        properties: {
          fileName: {
            type: 'string',
            description: '파일명',
            example: 'large_video.mp4',
          },
          folderId: {
            type: 'string',
            description: '대상 폴더 ID',
            example: 'folder_abc123',
          },
          totalSize: {
            type: 'number',
            description: '파일 전체 크기 (bytes)',
            example: 1073741824,
          },
          mimeType: {
            type: 'string',
            description: 'MIME 타입',
            example: 'video/mp4',
          },
          conflictStrategy: {
            type: 'string',
            enum: ['ERROR', 'RENAME'],
            description: '이름 충돌 시 처리 전략',
            default: 'ERROR',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: '멀티파트 업로드 세션 생성 성공',
      schema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
          partSize: { type: 'number', example: 10485760, description: '파트 크기 (bytes)' },
          totalParts: { type: 'number', example: 103, description: '총 파트 수' },
          expiresAt: { type: 'string', example: '2024-01-24T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '파일 크기가 100MB 미만 (일반 업로드 사용)' }),
    ApiResponse({ status: 404, description: '대상 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '폴더가 동기화 중' }),
  );

/**
 * 파트 업로드 API 문서
 */
export const ApiMultipartUploadPart = () =>
  applyDecorators(
    ApiOperation({
      summary: '파트 업로드',
      description: `
멀티파트 업로드의 개별 파트를 업로드합니다.

### 파트 번호
- 파트 번호는 1부터 시작합니다.
- 순서대로 업로드할 필요 없이 병렬로 업로드 가능합니다.
- 동일 파트 번호로 재업로드 시 덮어씁니다.

### 파트 크기
- 마지막 파트를 제외한 모든 파트는 initiate 시 반환된 partSize와 동일해야 합니다.
- 마지막 파트는 남은 크기만큼의 데이터를 전송합니다.
      `,
    }),
    ApiParam({
      name: 'sessionId',
      description: '업로드 세션 ID',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    ApiParam({
      name: 'partNumber',
      description: '파트 번호 (1부터 시작)',
      example: 1,
    }),
    ApiConsumes('application/octet-stream'),
    ApiBody({
      description: '파트 바이너리 데이터',
      schema: {
        type: 'string',
        format: 'binary',
      },
    }),
    ApiResponse({
      status: 200,
      description: '파트 업로드 성공',
      schema: {
        type: 'object',
        properties: {
          partNumber: { type: 'number', example: 1 },
          etag: { type: 'string', example: 'd41d8cd98f00b204e9800998ecf8427e' },
          size: { type: 'number', example: 10485760 },
          sessionProgress: { type: 'number', example: 25, description: '세션 전체 진행률 (%)' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '유효하지 않은 파트 번호 또는 세션 만료' }),
    ApiResponse({ status: 404, description: '세션을 찾을 수 없음' }),
  );

/**
 * 멀티파트 업로드 완료 API 문서
 */
export const ApiMultipartComplete = () =>
  applyDecorators(
    ApiOperation({
      summary: '멀티파트 업로드 완료',
      description: `
멀티파트 업로드를 완료하고 파일을 생성합니다.

### 프로세스
1. 모든 파트가 업로드되었는지 확인합니다.
2. 파트들을 병합하여 최종 파일을 생성합니다.
3. NAS 동기화 작업을 등록합니다.

### 주의사항
- 모든 파트가 업로드되지 않으면 에러가 발생합니다.
- 완료 후 세션은 COMPLETED 상태가 됩니다.
- 파트 파일들은 자동으로 정리됩니다.
      `,
    }),
    ApiParam({
      name: 'sessionId',
      description: '업로드 세션 ID',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    ApiBody({
      description: '완료 요청 (선택적 파트 목록)',
      required: false,
      schema: {
        type: 'object',
        properties: {
          parts: {
            type: 'array',
            description: '완료된 파트 목록 (검증용, 선택)',
            items: {
              type: 'object',
              properties: {
                partNumber: { type: 'number', example: 1 },
                etag: { type: 'string', example: 'd41d8cd98f00b204e9800998ecf8427e' },
              },
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: '멀티파트 업로드 완료 성공',
      schema: {
        type: 'object',
        properties: {
          fileId: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'large_video.mp4' },
          folderId: { type: 'string', example: 'folder_abc123' },
          path: { type: 'string', example: '/videos/large_video.mp4' },
          size: { type: 'number', example: 1073741824 },
          mimeType: { type: 'string', example: 'video/mp4' },
          storageStatus: {
            type: 'object',
            properties: {
              cache: { type: 'string', example: 'AVAILABLE' },
              nas: { type: 'string', example: 'SYNCING' },
            },
          },
          createdAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
          syncEventId: { type: 'string', example: '660e8400-e29b-41d4-a716-446655440000' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '모든 파트가 업로드되지 않음 또는 세션 만료' }),
    ApiResponse({ status: 404, description: '세션을 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '이미 완료된 세션 또는 취소된 세션' }),
  );

/**
 * 세션 상태 조회 API 문서
 */
export const ApiMultipartStatus = () =>
  applyDecorators(
    ApiOperation({
      summary: '세션 상태 조회',
      description: `
멀티파트 업로드 세션의 현재 상태를 조회합니다.

### 용도
- 업로드 재개 시 완료된 파트 확인
- 진행률 확인
- 세션 만료 여부 확인
      `,
    }),
    ApiParam({
      name: 'sessionId',
      description: '업로드 세션 ID',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    ApiResponse({
      status: 200,
      description: '세션 상태 조회 성공',
      schema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
          fileName: { type: 'string', example: 'large_video.mp4' },
          status: {
            type: 'string',
            enum: ['INIT', 'UPLOADING', 'COMPLETED', 'ABORTED', 'EXPIRED'],
            example: 'UPLOADING',
          },
          totalSize: { type: 'number', example: 1073741824 },
          uploadedBytes: { type: 'number', example: 268435456 },
          progress: { type: 'number', example: 25, description: '진행률 (%)' },
          totalParts: { type: 'number', example: 103 },
          completedParts: {
            type: 'array',
            items: { type: 'number' },
            example: [1, 2, 3, 4, 5],
          },
          nextPartNumber: { type: 'number', example: 6, nullable: true },
          remainingBytes: { type: 'number', example: 805306368 },
          expiresAt: { type: 'string', example: '2024-01-24T10:00:00.000Z' },
          fileId: { type: 'string', nullable: true, description: '완료 시 생성된 파일 ID' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '세션을 찾을 수 없음' }),
  );

/**
 * 업로드 취소 API 문서
 */
export const ApiMultipartAbort = () =>
  applyDecorators(
    ApiOperation({
      summary: '업로드 취소',
      description: `
멀티파트 업로드를 취소합니다.

### 주의사항
- 완료된 세션은 취소할 수 없습니다. 파일 삭제 API를 사용하세요.
- 이미 취소되거나 만료된 세션은 성공 응답을 반환합니다.
- 업로드된 파트 파일들은 자동으로 정리됩니다.
      `,
    }),
    ApiParam({
      name: 'sessionId',
      description: '업로드 세션 ID',
      example: '550e8400-e29b-41d4-a716-446655440000',
    }),
    ApiResponse({
      status: 200,
      description: '업로드 취소 성공',
      schema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
          status: { type: 'string', example: 'ABORTED' },
          message: { type: 'string', example: '업로드가 취소되었습니다.' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '세션을 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '이미 완료된 세션' }),
  );
