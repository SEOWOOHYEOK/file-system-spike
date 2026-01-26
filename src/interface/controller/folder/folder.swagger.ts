/**
 * Folder Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

/**
 * 폴더 생성 API 문서
 */
export const ApiFolderCreate = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 생성',
      description: `
새 폴더를 생성합니다.

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름 폴더 존재 시 에러 (기본값)
- \`RENAME\`: 자동 이름 변경 (예: folder(1))

### 루트 폴더
- parentId를 null로 설정하면 루트에 폴더가 생성됩니다.
      `,
    }),
    ApiBody({
      description: '폴더 생성 정보',
      schema: {
        type: 'object',
        required: ['name', 'parentId'],
        properties: {
          name: {
            type: 'string',
            description: '폴더 이름',
            example: 'New Folder',
          },
          parentId: {
            type: 'string',
            description: '상위 폴더 ID (null = 루트)',
            example: 'folder_parent123',
            nullable: true,
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
      description: '폴더 생성 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'folder_abc123' },
          name: { type: 'string', example: 'New Folder' },
          parentId: { type: 'string', example: 'folder_parent123', nullable: true },
          path: { type: 'string', example: '/documents/New Folder' },
          storageStatus: {
            type: 'object',
            properties: {
              nas: { type: 'string', example: 'SYNCING' },
            },
          },
          createdAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 폴더명' }),
    ApiResponse({ status: 404, description: '상위 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '동일한 이름의 폴더가 이미 존재함' }),
  );

/**
 * 폴더 정보 조회 API 문서
 */
export const ApiFolderInfo = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 정보 조회',
      description: `
폴더의 상세 정보를 조회합니다.

### 포함 정보
- 기본 정보 (이름, 경로, 상태 등)
- 직계 파일/폴더 수
- 하위 전체 파일 크기 합계
      `,
    }),
    ApiResponse({
      status: 200,
      description: '폴더 정보 조회 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'folder_abc123' },
          name: { type: 'string', example: 'Documents' },
          parentId: { type: 'string', example: 'folder_root', nullable: true },
          path: { type: 'string', example: '/Documents' },
          state: { type: 'string', enum: ['ACTIVE', 'TRASHED', 'DELETED'], example: 'ACTIVE' },
          storageStatus: {
            type: 'object',
            properties: {
              nas: { type: 'string', example: 'AVAILABLE', nullable: true },
            },
          },
          fileCount: { type: 'number', description: '직계 파일 수', example: 15 },
          folderCount: { type: 'number', description: '직계 폴더 수', example: 3 },
          totalSize: { type: 'number', description: '하위 전체 크기 (bytes)', example: 52428800 },
          createdAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
          updatedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '폴더를 찾을 수 없음' }),
  );

/**
 * 폴더 내용 조회 API 문서
 */
export const ApiFolderContents = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 내용 조회',
      description: `
폴더 내의 하위 폴더와 파일 목록을 조회합니다.

### 정렬 옵션 (sortBy)
| 값 | 설명 |
|---|---|
| \`name\` | 이름순 (기본값) |
| \`type\` | 유형순 (mimeType 기준, 폴더는 'folder'로 처리) |
| \`createdAt\` | 생성일순 |
| \`updatedAt\` | 수정일순 |
| \`size\` | 크기순 (파일만 해당, 폴더는 0으로 처리) |

### 정렬 순서 (sortOrder)
| 값 | 설명 |
|---|---|
| \`asc\` | 오름차순 (기본값) |
| \`desc\` | 내림차순 |

### 페이지네이션
- \`page\`: 페이지 번호 (1부터 시작, 기본값: 1)
- \`pageSize\`: 페이지 크기 (기본값: 50, 최대: 100)

### 응답 페이지네이션 정보
- \`page\`: 현재 페이지 번호
- \`pageSize\`: 현재 페이지 크기
- \`totalItems\`: 전체 항목 개수 (폴더 + 파일)
- \`totalPages\`: 전체 페이지 수
- \`hasNext\`: 다음 페이지 존재 여부
- \`hasPrev\`: 이전 페이지 존재 여부
      `,
    }),
    ApiParam({
      name: 'folderId',
      description: '폴더 ID',
      example: 'folder_abc123',
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      enum: ['name', 'type', 'createdAt', 'updatedAt', 'size'],
      description: '정렬 기준 (name: 이름순, type: 유형순, createdAt: 생성일순, updatedAt: 수정일순, size: 크기순)',
      example: 'name',
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['asc', 'desc'],
      description: '정렬 순서 (asc: 오름차순, desc: 내림차순)',
      example: 'asc',
    }),
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: '페이지 번호 (1부터 시작)',
      example: 1,
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      type: Number,
      description: '페이지 크기 (1~100, 기본값: 50)',
      example: 50,
    }),
    ApiResponse({
      status: 200,
      description: '폴더 내용 조회 성공',
      schema: {
        type: 'object',
        properties: {
          folderId: { type: 'string', example: 'folder_abc123' },
          path: { type: 'string', example: '/Documents' },
          breadcrumbs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
              },
            },
            example: [{ id: 'folder_root', name: 'Root' }, { id: 'folder_abc123', name: 'Documents' }],
          },
          folders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                path: { type: 'string' },
                storageStatus: {
                  type: 'object',
                  properties: {
                    nas: { type: 'string', nullable: true },
                  },
                },
                fileCount: { type: 'number' },
                folderCount: { type: 'number' },
                updatedAt: { type: 'string' },
              },
            },
          },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                size: { type: 'number' },
                mimeType: { type: 'string' },
                storageStatus: {
                  type: 'object',
                  properties: {
                    cache: { type: 'string', nullable: true },
                    nas: { type: 'string', nullable: true },
                  },
                },
                updatedAt: { type: 'string' },
              },
            },
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'number', description: '현재 페이지 번호', example: 1 },
              pageSize: { type: 'number', description: '현재 페이지 크기', example: 50 },
              totalItems: { type: 'number', description: '전체 항목 개수 (폴더 + 파일)', example: 125 },
              totalPages: { type: 'number', description: '전체 페이지 수', example: 3 },
              hasNext: { type: 'boolean', description: '다음 페이지 존재 여부', example: true },
              hasPrev: { type: 'boolean', description: '이전 페이지 존재 여부', example: false },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 쿼리 파라미터' }),
    ApiResponse({ status: 404, description: '폴더를 찾을 수 없음' }),
  );

/**
 * 폴더명 변경 API 문서
 */
export const ApiFolderRename = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더명 변경',
      description: `
폴더의 이름을 변경합니다.

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름 폴더 존재 시 에러 (기본값)
- \`RENAME\`: 자동 이름 변경 (예: folder(1))
      `,
    }),
    ApiParam({
      name: 'folderId',
      description: '폴더 ID',
      example: 'folder_abc123',
    }),
    ApiBody({
      description: '새 폴더명 정보',
      schema: {
        type: 'object',
        required: ['newName'],
        properties: {
          newName: {
            type: 'string',
            description: '새 폴더명',
            example: 'Renamed Folder',
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
      description: '폴더명 변경 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'folder_abc123' },
          name: { type: 'string', example: 'Renamed Folder' },
          path: { type: 'string', example: '/Renamed Folder' },
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
    ApiResponse({ status: 400, description: '잘못된 폴더명' }),
    ApiResponse({ status: 404, description: '폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '동일한 이름의 폴더가 이미 존재함' }),
  );

/**
 * 폴더 이동 API 문서
 */
export const ApiFolderMove = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 이동',
      description: `
폴더를 다른 위치로 이동합니다.

### 충돌 전략 (conflictStrategy)
- \`ERROR\`: 동일 이름 폴더 존재 시 에러 (기본값)
- \`RENAME\`: 자동 이름 변경 (예: folder(1))
- \`SKIP\`: 이동 건너뛰기

### 주의사항
- 자신의 하위 폴더로는 이동할 수 없습니다.
- 하위 파일/폴더도 함께 이동됩니다.
      `,
    }),
    ApiParam({
      name: 'folderId',
      description: '이동할 폴더 ID',
      example: 'folder_abc123',
    }),
    ApiBody({
      description: '이동 대상 정보',
      schema: {
        type: 'object',
        required: ['targetParentId'],
        properties: {
          targetParentId: {
            type: 'string',
            description: '이동 대상 상위 폴더 ID',
            example: 'folder_target123',
          },
          conflictStrategy: {
            type: 'string',
            enum: ['ERROR', 'RENAME', 'SKIP'],
            description: '이름 충돌 시 처리 전략',
            default: 'ERROR',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: '폴더 이동 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'folder_abc123' },
          name: { type: 'string', example: 'Documents' },
          parentId: { type: 'string', example: 'folder_target123' },
          path: { type: 'string', example: '/Archive/Documents' },
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
    ApiResponse({ status: 400, description: '잘못된 요청 (자기 자신의 하위로 이동 등)' }),
    ApiResponse({ status: 404, description: '폴더 또는 대상 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '동일한 이름의 폴더가 이미 존재함 (ERROR 전략)' }),
  );

/**
 * 폴더 삭제 API 문서
 */
export const ApiFolderDelete = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 삭제 (휴지통 이동)',
      description: `
폴더를 휴지통으로 이동합니다.

### 주의사항
- 영구삭제가 아닌 휴지통 이동입니다.
- 하위 파일/폴더도 함께 휴지통으로 이동됩니다.
- 휴지통에서 복원하거나 영구삭제할 수 있습니다.
      `,
    }),
    ApiParam({
      name: 'folderId',
      description: '삭제할 폴더 ID',
      example: 'folder_abc123',
    }),
    ApiResponse({
      status: 200,
      description: '폴더 삭제 성공 (휴지통 이동)',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'folder_abc123' },
          name: { type: 'string', example: 'Documents' },
          state: { type: 'string', example: 'TRASHED' },
          deletedChildCount: { type: 'number', description: '함께 삭제된 하위 항목 수', example: 25 },
          trashedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '폴더를 찾을 수 없음' }),
  );
