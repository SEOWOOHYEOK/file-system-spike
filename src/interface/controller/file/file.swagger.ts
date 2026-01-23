/**
 * File Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';

/**
 * 파일 업로드 API 문서
 */
export const ApiFileUpload = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 업로드',
      description: `
일반 파일을 업로드합니다 (100MB 미만).

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름 파일 존재 시 에러 (기본값)
- \`RENAME\`: 자동 이름 변경 (예: file(1).txt)

### 주의사항
- 파일은 먼저 캐시 스토리지에 저장된 후 NAS로 동기화됩니다.
- 업로드 직후 storageStatus는 { cache: 'AVAILABLE', nas: 'SYNCING' } 입니다.
      `,
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: '업로드할 파일과 대상 폴더 정보',
      schema: {
        type: 'object',
        required: ['file', 'folderId'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: '업로드할 파일',
          },
          folderId: {
            type: 'string',
            description: '대상 폴더 ID',
            example: 'folder_abc123',
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
      description: '파일 업로드 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'document.pdf' },
          folderId: { type: 'string', example: 'folder_abc123' },
          path: { type: 'string', example: '/documents/document.pdf' },
          size: { type: 'number', example: 1024000 },
          mimeType: { type: 'string', example: 'application/pdf' },
          storageStatus: {
            type: 'object',
            properties: {
              cache: { type: 'string', example: 'AVAILABLE' },
              nas: { type: 'string', example: 'SYNCING' },
            },
          },
          createdAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (파일 없음, 폴더 ID 없음 등)' }),
    ApiResponse({ status: 404, description: '대상 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '동일한 이름의 파일이 이미 존재함 (ERROR 전략)' }),
    ApiResponse({ status: 413, description: '파일 크기 초과' }),
  );

/**
 * 파일 정보 조회 API 문서
 */
export const ApiFileInfo = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 정보 조회',
      description: `
파일의 상세 정보를 조회합니다.

### 스토리지 상태 (storageStatus)
- \`cache\`: 캐시 스토리지 상태 (AVAILABLE | SYNCING | null)
- \`nas\`: NAS 스토리지 상태 (AVAILABLE | SYNCING | null)
      `,
    }),
    ApiParam({
      name: 'fileId',
      description: '파일 ID',
      example: 'file_abc123',
    }),
    ApiResponse({
      status: 200,
      description: '파일 정보 조회 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'document.pdf' },
          folderId: { type: 'string', example: 'folder_abc123' },
          path: { type: 'string', example: '/documents/document.pdf' },
          size: { type: 'number', example: 1024000 },
          mimeType: { type: 'string', example: 'application/pdf' },
          state: { type: 'string', enum: ['ACTIVE', 'TRASHED', 'DELETED'], example: 'ACTIVE' },
          storageStatus: {
            type: 'object',
            properties: {
              cache: { type: 'string', example: 'AVAILABLE', nullable: true },
              nas: { type: 'string', example: 'AVAILABLE', nullable: true },
            },
          },
          createdAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
          updatedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '파일을 찾을 수 없음' }),
  );

/**
 * 파일 다운로드 API 문서
 */
export const ApiFileDownload = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 다운로드',
      description: `
파일을 스트림으로 다운로드합니다.

### 응답 헤더
- \`Content-Type\`: 파일의 MIME 타입
- \`Content-Disposition\`: attachment; filename*=UTF-8''(인코딩된 파일명)
- \`Content-Length\`: 파일 크기 (bytes)
      `,
    }),
    ApiParam({
      name: 'fileId',
      description: '다운로드할 파일 ID',
      example: 'file_abc123',
    }),
    ApiProduces('application/octet-stream'),
    ApiResponse({
      status: 200,
      description: '파일 다운로드 성공',
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '파일을 찾을 수 없음' }),
    ApiResponse({ status: 503, description: '스토리지 접근 불가' }),
  );

/**
 * 파일명 변경 API 문서
 */
export const ApiFileRename = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일명 변경',
      description: `
파일의 이름을 변경합니다.

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름 파일 존재 시 에러 (기본값)
- \`RENAME\`: 자동 이름 변경 (예: file(1).txt)

### 주의사항
- NAS 동기화가 필요하므로 storageStatus.nas가 'SYNCING'으로 변경됩니다.
      `,
    }),
    ApiParam({
      name: 'fileId',
      description: '파일 ID',
      example: 'file_abc123',
    }),
    ApiBody({
      description: '새 파일명 정보',
      schema: {
        type: 'object',
        required: ['newName'],
        properties: {
          newName: {
            type: 'string',
            description: '새 파일명',
            example: 'new_document.pdf',
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
      status: 200,
      description: '파일명 변경 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'new_document.pdf' },
          path: { type: 'string', example: '/documents/new_document.pdf' },
          storageStatus: {
            type: 'object',
            properties: {
              nas: { type: 'string', example: 'SYNCING' },
            },
          },
          updatedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 파일명' }),
    ApiResponse({ status: 404, description: '파일을 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '동일한 이름의 파일이 이미 존재함' }),
  );

/**
 * 파일 이동 API 문서
 */
export const ApiFileMove = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 이동',
      description: `
파일을 다른 폴더로 이동합니다.

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름 파일 존재 시 에러 (기본값)
- \`OVERWRITE\`: 기존 파일 덮어쓰기
- \`RENAME\`: 자동 이름 변경 (예: file(1).txt)
- \`SKIP\`: 이동 건너뛰기

### SKIP 응답
- skipped: true, reason: 충돌 사유
      `,
    }),
    ApiParam({
      name: 'fileId',
      description: '이동할 파일 ID',
      example: 'file_abc123',
    }),
    ApiBody({
      description: '이동 대상 정보',
      schema: {
        type: 'object',
        required: ['targetFolderId'],
        properties: {
          targetFolderId: {
            type: 'string',
            description: '이동 대상 폴더 ID',
            example: 'folder_xyz789',
          },
          conflictStrategy: {
            type: 'string',
            enum: ['ERROR', 'OVERWRITE', 'RENAME', 'SKIP'],
            description: '이름 충돌 시 처리 전략',
            default: 'ERROR',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: '파일 이동 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'document.pdf' },
          folderId: { type: 'string', example: 'folder_xyz789' },
          path: { type: 'string', example: '/archive/document.pdf' },
          skipped: { type: 'boolean', example: false },
          reason: { type: 'string', example: null, nullable: true },
          storageStatus: {
            type: 'object',
            properties: {
              nas: { type: 'string', example: 'SYNCING' },
            },
          },
          updatedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 요청' }),
    ApiResponse({ status: 404, description: '파일 또는 대상 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '동일한 이름의 파일이 이미 존재함 (ERROR 전략)' }),
  );

/**
 * 파일 삭제 API 문서
 */
export const ApiFileDelete = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 삭제 (휴지통 이동)',
      description: `
파일을 휴지통으로 이동합니다.

### 주의사항
- 영구삭제가 아닌 휴지통 이동입니다.
- 휴지통에서 복원하거나 영구삭제할 수 있습니다.
- 일정 기간 후 자동으로 영구삭제됩니다.
      `,
    }),
    ApiParam({
      name: 'fileId',
      description: '삭제할 파일 ID',
      example: 'file_abc123',
    }),
    ApiResponse({
      status: 200,
      description: '파일 삭제 성공 (휴지통 이동)',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'document.pdf' },
          state: { type: 'string', example: 'TRASHED' },
          trashedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '파일을 찾을 수 없음' }),
  );
