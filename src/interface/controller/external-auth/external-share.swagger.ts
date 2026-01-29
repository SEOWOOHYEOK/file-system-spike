/**
 * External Share Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  MyShareListItemDto,
  ShareDetailResponseDto,
} from './dto/external-share-access.dto';

/**
 * 나에게 공유된 파일 목록 API 문서
 */
export const ApiGetMyShares = () =>
  applyDecorators(
    ApiOperation({
      summary: '나에게 공유된 파일 목록',
      description: `
현재 로그인한 외부 사용자에게 공유된 파일 목록을 조회합니다.

### 필터링
- 활성 상태인 공유만 표시됩니다 (취소/차단되지 않은 공유)
- 만료되지 않은 공유만 표시됩니다

### 정렬
- \`sortBy\`: 정렬 기준 필드 (기본값: createdAt)
- \`sortOrder\`: 정렬 순서 (asc/desc, 기본값: desc)
      `,
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiQuery({ name: 'sortBy', type: String, required: false, description: '정렬 기준 필드', example: 'createdAt' }),
    ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false, description: '정렬 순서' }),
    ApiResponse({
      status: 200,
      description: '공유 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/MyShareListItemDto' },
          },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          totalItems: { type: 'integer', example: 5 },
          totalPages: { type: 'integer', example: 1 },
          hasNext: { type: 'boolean', example: false },
          hasPrev: { type: 'boolean', example: false },
        },
      },
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
  );

/**
 * 공유 상세 조회 API 문서
 */
export const ApiGetShareDetail = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 상세 조회 및 콘텐츠 토큰 발급',
      description: `
특정 공유의 상세 정보를 조회하고, 파일 접근을 위한 일회성 콘텐츠 토큰을 발급받습니다.

### 콘텐츠 토큰
- 파일 뷰어 또는 다운로드 시 필요한 일회성 토큰입니다.
- 토큰은 제한된 시간 동안만 유효합니다.
- \`/content\` 또는 \`/download\` API 호출 시 query parameter로 전달합니다.

### 주의사항
- 본인에게 공유된 파일만 조회 가능합니다.
- 취소되거나 차단된 공유는 접근할 수 없습니다.
      `,
    }),
    ApiParam({
      name: 'shareId',
      type: String,
      description: '공유 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiResponse({
      status: 200,
      description: '공유 상세 조회 성공',
      type: ShareDetailResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '접근 권한 없음 (본인에게 공유되지 않음)' }),
    ApiResponse({ status: 404, description: '공유를 찾을 수 없음' }),
    ApiResponse({ status: 410, description: '공유가 만료되었거나 취소됨' }),
  );

/**
 * 파일 콘텐츠 조회 API 문서
 */
export const ApiGetContent = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 콘텐츠 (뷰어용)',
      description: `
파일 콘텐츠를 뷰어에서 표시하기 위해 조회합니다.

### 사전 조건
- \`GET /shares/:shareId\`에서 발급받은 콘텐츠 토큰이 필요합니다.
- \`VIEW\` 권한이 있어야 합니다.

### 접근 기록
- 조회 시마다 접근 기록이 남습니다 (IP, User-Agent, 디바이스 타입)
- 최대 조회 횟수가 설정된 경우, 횟수가 차감됩니다.
      `,
    }),
    ApiParam({
      name: 'shareId',
      type: String,
      description: '공유 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiQuery({
      name: 'token',
      type: String,
      required: true,
      description: '콘텐츠 접근 토큰 (상세 조회 시 발급)',
      example: 'ct_abc123def456...',
    }),
    ApiResponse({
      status: 200,
      description: '파일 콘텐츠 반환 (바이너리 스트림)',
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    }),
    ApiResponse({ status: 401, description: '유효하지 않은 콘텐츠 토큰' }),
    ApiResponse({ status: 403, description: 'VIEW 권한 없음' }),
    ApiResponse({ status: 410, description: '최대 조회 횟수 초과' }),
  );

/**
 * 파일 다운로드 API 문서
 */
export const ApiDownloadFile = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 다운로드',
      description: `
파일을 다운로드합니다.

### 사전 조건
- \`GET /shares/:shareId\`에서 발급받은 콘텐츠 토큰이 필요합니다.
- \`DOWNLOAD\` 권한이 있어야 합니다.

### 접근 기록
- 다운로드 시마다 접근 기록이 남습니다 (IP, User-Agent, 디바이스 타입)
- 최대 다운로드 횟수가 설정된 경우, 횟수가 차감됩니다.

### 주의사항
- VIEW 권한만 있는 경우 다운로드할 수 없습니다.
      `,
    }),
    ApiParam({
      name: 'shareId',
      type: String,
      description: '공유 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiQuery({
      name: 'token',
      type: String,
      required: true,
      description: '콘텐츠 접근 토큰 (상세 조회 시 발급)',
      example: 'ct_abc123def456...',
    }),
    ApiResponse({
      status: 200,
      description: '파일 다운로드 (바이너리 스트림)',
      headers: {
        'Content-Disposition': {
          description: 'attachment; filename="파일명.확장자"',
          schema: { type: 'string' },
        },
      },
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    }),
    ApiResponse({ status: 401, description: '유효하지 않은 콘텐츠 토큰' }),
    ApiResponse({ status: 403, description: 'DOWNLOAD 권한 없음' }),
    ApiResponse({ status: 410, description: '최대 다운로드 횟수 초과' }),
  );
