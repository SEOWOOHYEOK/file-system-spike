/**
 * Trash Controller Swagger 데코레이터
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
 * 휴지통 목록 조회 API 문서
 */
export const ApiTrashList = () =>
  applyDecorators(
    ApiOperation({
      summary: '휴지통 목록 조회',
      description: `
휴지통에 있는 파일/폴더 목록을 조회합니다.

### 정렬 옵션 (sortBy)
| 값 | 설명 |
|---|---|
| \`name\` | 이름순 |
| \`originalPath\` | 원래 위치순 |
| \`deletedAt\` | 삭제일순 (기본값) |
| \`sizeBytes\` | 크기순 |
| \`modifiedAt\` | 수정일순 |

### 정렬 순서 (sortOrder)
| 값 | 설명 |
|---|---|
| \`asc\` | 오름차순 |
| \`desc\` | 내림차순 (기본값) |

### 페이지네이션
- \`page\`: 페이지 번호 (1부터 시작, 기본값: 1)
- \`pageSize\`: 페이지 크기 (기본값: 50, 최대: 100)

### 응답 페이지네이션 정보
- \`page\`: 현재 페이지 번호
- \`pageSize\`: 현재 페이지 크기
- \`totalItems\`: 전체 항목 개수
- \`totalPages\`: 전체 페이지 수
- \`hasNext\`: 다음 페이지 존재 여부
- \`hasPrev\`: 이전 페이지 존재 여부

### 주의사항
- 휴지통 루트 레벨의 항목만 반환됩니다.
- 폴더 내부 항목은 별도 API로 조회합니다.
      `,
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      enum: ['name', 'originalPath', 'deletedAt', 'sizeBytes', 'modifiedAt'],
      description: '정렬 기준 (name: 이름순, originalPath: 원래 위치순, deletedAt: 삭제일순, sizeBytes: 크기순, modifiedAt: 수정일순)',
      example: 'deletedAt',
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['asc', 'desc'],
      description: '정렬 순서 (asc: 오름차순, desc: 내림차순)',
      example: 'desc',
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
      description: '휴지통 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['FILE', 'FOLDER'], example: 'FILE' },
                id: { type: 'string', example: 'file_abc123' },
                name: { type: 'string', example: 'document.pdf' },
                sizeBytes: { type: 'number', example: 1024000, nullable: true },
                mimeType: { type: 'string', example: 'application/pdf', nullable: true },
                trashMetadataId: { type: 'string', example: 'trash_meta123' },
                originalPath: { type: 'string', example: '/Documents/document.pdf' },
                deletedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
                deletedBy: { type: 'string', example: 'user123' },
                modifiedAt: { type: 'string', example: '2024-01-22T15:30:00.000Z' },
                expiresAt: { type: 'string', example: '2024-02-22T10:00:00.000Z' },
              },
            },
          },
          totalSizeBytes: { type: 'number', description: '휴지통 전체 크기 (bytes)', example: 524288000 },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'number', description: '현재 페이지 번호', example: 1 },
              pageSize: { type: 'number', description: '현재 페이지 크기', example: 50 },
              totalItems: { type: 'number', description: '전체 항목 개수', example: 125 },
              totalPages: { type: 'number', description: '전체 페이지 수', example: 3 },
              hasNext: { type: 'boolean', description: '다음 페이지 존재 여부', example: true },
              hasPrev: { type: 'boolean', description: '이전 페이지 존재 여부', example: false },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 쿼리 파라미터' }),
  );

/**
 * 휴지통 폴더 내용 조회 API 문서
 */
export const ApiTrashFolderContents = () =>
  applyDecorators(
    ApiOperation({
      summary: '휴지통 폴더 내부 조회',
      description: `
휴지통에 있는 폴더의 내부 항목을 조회합니다.

### 용도
- 삭제된 폴더의 내부 구조 확인
- 복원 전 내용물 미리보기

### 브레드크럼
- 휴지통 루트부터 현재 폴더까지의 경로를 제공합니다.
      `,
    }),
    ApiParam({
      name: 'folderId',
      description: '휴지통 내 폴더 ID',
      example: 'folder_abc123',
    }),
    ApiResponse({
      status: 200,
      description: '휴지통 폴더 내용 조회 성공',
      schema: {
        type: 'object',
        properties: {
          currentFolder: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'folder_abc123' },
              name: { type: 'string', example: 'Documents' },
            },
          },
          parentFolder: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
          breadcrumb: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['FILE', 'FOLDER'] },
                id: { type: 'string' },
                name: { type: 'string' },
                sizeBytes: { type: 'number', nullable: true },
                mimeType: { type: 'string', nullable: true },
                modifiedAt: { type: 'string' },
              },
            },
          },
          totalCount: { type: 'number', example: 15 },
        },
      },
    }),
    ApiResponse({ status: 404, description: '폴더를 찾을 수 없음' }),
  );

/**
 * 파일 복원 정보 조회 API 문서
 */
export const ApiFileRestoreInfo = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 복원 정보 조회',
      description: `
파일 복원 전 필요한 정보를 조회합니다.

### 경로 상태 (pathStatus)
- \`AVAILABLE\`: 원래 폴더가 존재함
- \`PATH_NOT_FOUND\`: 원래 폴더가 삭제됨

### 충돌 확인 (hasConflict)
- 원래 위치에 동일 이름 파일이 있는지 확인
- 충돌 시 conflictFileName 제공
      `,
    }),
    ApiParam({
      name: 'trashMetadataId',
      description: '휴지통 메타데이터 ID',
      example: 'trash_meta123',
    }),
    ApiResponse({
      status: 200,
      description: '파일 복원 정보 조회 성공',
      schema: {
        type: 'object',
        properties: {
          trashId: { type: 'string', example: 'trash_meta123' },
          fileName: { type: 'string', example: 'document.pdf' },
          originalPath: { type: 'string', example: '/Documents/document.pdf' },
          originalFolderId: { type: 'string', example: 'folder_abc123' },
          pathStatus: { type: 'string', enum: ['AVAILABLE', 'PATH_NOT_FOUND'], example: 'AVAILABLE' },
          hasConflict: { type: 'boolean', example: false },
          conflictFileName: { type: 'string', example: null, nullable: true },
        },
      },
    }),
    ApiResponse({ status: 404, description: '휴지통 항목을 찾을 수 없음' }),
  );

/**
 * 폴더 복원 정보 조회 API 문서
 */
export const ApiFolderRestoreInfo = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 복원 정보 조회',
      description: `
폴더 복원 전 필요한 정보를 조회합니다.

### 경로 상태 (parentPathStatus)
- \`AVAILABLE\`: 상위 폴더가 존재함
- \`PATH_NOT_FOUND\`: 상위 폴더가 삭제됨

### 복원 전략 선택
- PATH_NOT_FOUND인 경우 복원 전략을 선택해야 합니다:
  - \`CHOOSE_LOCATION\`: 다른 위치 선택
  - \`RECREATE_PATH\`: 원래 경로 재생성
      `,
    }),
    ApiParam({
      name: 'trashMetadataId',
      description: '휴지통 메타데이터 ID',
      example: 'trash_meta123',
    }),
    ApiResponse({
      status: 200,
      description: '폴더 복원 정보 조회 성공',
      schema: {
        type: 'object',
        properties: {
          trashId: { type: 'string', example: 'trash_meta123' },
          folderName: { type: 'string', example: 'Documents' },
          originalPath: { type: 'string', example: '/Archive/Documents' },
          originalParentId: { type: 'string', example: 'folder_archive' },
          parentPathStatus: { type: 'string', enum: ['AVAILABLE', 'PATH_NOT_FOUND'], example: 'AVAILABLE' },
          hasConflict: { type: 'boolean', example: false },
          conflictFolderId: { type: 'string', example: null, nullable: true },
          conflictFolderName: { type: 'string', example: null, nullable: true },
          childCount: {
            type: 'object',
            properties: {
              files: { type: 'number', example: 10 },
              folders: { type: 'number', example: 3 },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: '휴지통 항목을 찾을 수 없음' }),
  );

/**
 * 파일 복원 API 문서
 */
export const ApiFileRestore = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 복원',
      description: `
휴지통에서 파일을 복원합니다.

### 충돌 처리
- 동일 이름 파일이 있는 경우 newFileName을 지정해야 합니다.
- newFileName 미지정 시 에러 발생

### 경로 없음 처리
- 원래 폴더가 없는 경우 에러 발생
- 먼저 폴더를 복원하거나 다른 위치에 복원해야 합니다.
      `,
    }),
    ApiParam({
      name: 'trashMetadataId',
      description: '휴지통 메타데이터 ID',
      example: 'trash_meta123',
    }),
    ApiBody({
      description: '파일 복원 옵션',
      schema: {
        type: 'object',
        properties: {
          newFileName: {
            type: 'string',
            description: '충돌 시 새 파일명',
            example: 'document_restored.pdf',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: '파일 복원 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'document.pdf' },
          path: { type: 'string', example: '/Documents/document.pdf' },
          restoredAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (충돌 시 새 파일명 미지정 등)' }),
    ApiResponse({ status: 404, description: '휴지통 항목 또는 원래 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '파일명 충돌' }),
  );

/**
 * 폴더 복원 API 문서
 */
export const ApiFolderRestore = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 복원',
      description: `
휴지통에서 폴더를 복원합니다.

### 복원 전략 (restoreStrategy)
- \`CHOOSE_LOCATION\`: 다른 위치에 복원 (targetParentId 필수)
- \`RECREATE_PATH\`: 원래 경로 재생성

### 충돌 처리
- 동일 이름 폴더가 있는 경우 newFolderName을 지정해야 합니다.

### 주의사항
- 하위 파일/폴더도 함께 복원됩니다.
      `,
    }),
    ApiParam({
      name: 'trashMetadataId',
      description: '휴지통 메타데이터 ID',
      example: 'trash_meta123',
    }),
    ApiBody({
      description: '폴더 복원 옵션',
      schema: {
        type: 'object',
        properties: {
          restoreStrategy: {
            type: 'string',
            enum: ['CHOOSE_LOCATION', 'RECREATE_PATH'],
            description: '복원 전략 (PATH_NOT_FOUND인 경우 필수)',
          },
          targetParentId: {
            type: 'string',
            description: 'CHOOSE_LOCATION 전략 시 대상 폴더 ID',
            example: 'folder_target123',
          },
          newFolderName: {
            type: 'string',
            description: '충돌 시 새 폴더명',
            example: 'Documents_restored',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: '폴더 복원 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'folder_abc123' },
          name: { type: 'string', example: 'Documents' },
          path: { type: 'string', example: '/Archive/Documents' },
          restoredAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (전략 미지정, 충돌 시 새 폴더명 미지정 등)' }),
    ApiResponse({ status: 404, description: '휴지통 항목 또는 대상 폴더를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '폴더명 충돌' }),
  );

/**
 * 파일 영구삭제 API 문서
 */
export const ApiFilePurge = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 영구삭제',
      description: `
휴지통에서 파일을 영구삭제합니다.

### 주의사항
- 이 작업은 되돌릴 수 없습니다.
- 모든 스토리지(캐시, NAS)에서 삭제됩니다.
      `,
    }),
    ApiParam({
      name: 'trashMetadataId',
      description: '휴지통 메타데이터 ID',
      example: 'trash_meta123',
    }),
    ApiResponse({
      status: 200,
      description: '파일 영구삭제 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file_abc123' },
          name: { type: 'string', example: 'document.pdf' },
          type: { type: 'string', example: 'FILE' },
          purgedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '휴지통 항목을 찾을 수 없음' }),
  );

/**
 * 폴더 영구삭제 API 문서
 */
export const ApiFolderPurge = () =>
  applyDecorators(
    ApiOperation({
      summary: '폴더 영구삭제',
      description: `
휴지통에서 폴더를 영구삭제합니다.

### 주의사항
- 이 작업은 되돌릴 수 없습니다.
- 하위 파일/폴더도 모두 영구삭제됩니다.
- 모든 스토리지(캐시, NAS)에서 삭제됩니다.
      `,
    }),
    ApiParam({
      name: 'trashMetadataId',
      description: '휴지통 메타데이터 ID',
      example: 'trash_meta123',
    }),
    ApiResponse({
      status: 200,
      description: '폴더 영구삭제 성공',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'folder_abc123' },
          name: { type: 'string', example: 'Documents' },
          type: { type: 'string', example: 'FOLDER' },
          purgedAt: { type: 'string', example: '2024-01-23T10:00:00.000Z' },
        },
      },
    }),
    ApiResponse({ status: 404, description: '휴지통 항목을 찾을 수 없음' }),
  );

/**
 * 휴지통 비우기 API 문서
 */
export const ApiEmptyTrash = () =>
  applyDecorators(
    ApiOperation({
      summary: '휴지통 비우기',
      description: `
휴지통의 모든 항목을 영구삭제합니다.

### 주의사항
- 이 작업은 되돌릴 수 없습니다.
- 모든 파일과 폴더가 영구삭제됩니다.
- 대량 삭제이므로 시간이 걸릴 수 있습니다.
      `,
    }),
    ApiResponse({
      status: 200,
      description: '휴지통 비우기 성공',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string', example: '휴지통을 비웠습니다.' },
          success: { type: 'number', description: '성공한 항목 수', example: 42 },
          failed: { type: 'number', description: '실패한 항목 수', example: 0 },
        },
      },
    }),
  );

/**
 * 전체 복원 API 문서
 */
export const ApiRestoreAll = () =>
  applyDecorators(
    ApiOperation({
      summary: '모든 항목 복원',
      description: `
휴지통의 모든 항목을 원래 위치로 복원합니다.

### 충돌 처리
- 이름 충돌이 있는 항목은 건너뜁니다.
- 건너뛴 항목은 skippedItems에 포함됩니다.

### 경로 없음 처리
- 원래 경로가 없는 항목은 자동으로 경로를 재생성합니다.
      `,
    }),
    ApiResponse({
      status: 200,
      description: '전체 복원 완료',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string', example: '복원이 완료되었습니다.' },
          restored: { type: 'number', description: '복원 성공 수', example: 38 },
          skipped: { type: 'number', description: '건너뛴 항목 수', example: 4 },
          failed: { type: 'number', description: '실패한 항목 수', example: 0 },
          skippedItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'file_conflict123' },
                name: { type: 'string', example: 'document.pdf' },
                reason: { type: 'string', example: 'CONFLICT' },
                conflictWith: { type: 'string', example: 'file_existing456' },
              },
            },
          },
        },
      },
    }),
  );
