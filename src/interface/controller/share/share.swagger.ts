/**
 * Share Controller Swagger 데코레이터
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
import {
  CreatePublicShareRequestDto,
} from './dto/create-public-share.dto';
import {
  PublicShareResponseDto,
  RevokeShareResponseDto,
} from './dto/public-share-response.dto';

/**
 * 외부 공유 생성 API 문서
 */
export const ApiCreatePublicShare = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일 외부공유 생성',
      description: `
외부 사용자에게 파일을 공유합니다.

### 권한 (permissions)
- \`VIEW\`: 뷰어에서 파일 보기만 가능
- \`DOWNLOAD\`: 파일 다운로드 가능

### 제한 설정 (선택)
- \`maxViewCount\`: 최대 뷰 횟수 (미설정 시 무제한)
- \`maxDownloadCount\`: 최대 다운로드 횟수 (미설정 시 무제한)
- \`expiresAt\`: 만료일시 (미설정 시 무기한)

### 주의사항
- 동일한 파일을 같은 외부 사용자에게 중복 공유할 수 없습니다.
- 외부 사용자가 비활성화 상태이면 공유가 불가능합니다.
      `,
    }),
    ApiBody({
      description: '외부 공유 생성 정보',
      type: CreatePublicShareRequestDto,
    }),
    ApiResponse({
      status: 201,
      description: '공유 생성 성공',
      type: PublicShareResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (필수 필드 누락 또는 유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '파일 또는 외부 사용자를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '이미 해당 파일이 해당 사용자에게 공유됨' }),
  );

/**
 * 내가 생성한 공유 목록 API 문서
 */
export const ApiGetMyPublicShares = () =>
  applyDecorators(
    ApiOperation({
      summary: '내가 생성한 공유 목록',
      description: `
내가 생성한 외부 공유 목록을 페이지네이션으로 조회합니다.

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
            items: { $ref: '#/components/schemas/PublicShareListItemDto' },
          },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          totalItems: { type: 'integer', example: 50 },
          totalPages: { type: 'integer', example: 3 },
          hasNext: { type: 'boolean', example: true },
          hasPrev: { type: 'boolean', example: false },
        },
      },
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
  );

/**
 * 공유 상세 조회 API 문서
 */
export const ApiGetPublicShareById = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 상세 조회',
      description: '특정 공유의 상세 정보를 조회합니다.',
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '공유 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiResponse({
      status: 200,
      description: '공유 상세 조회 성공',
      type: PublicShareResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '공유를 찾을 수 없음' }),
  );

/**
 * 공유 취소 API 문서
 */
export const ApiRevokeShare = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 취소',
      description: `
공유를 취소합니다.

### 주의사항
- 공유를 생성한 소유자만 취소할 수 있습니다.
- 취소된 공유는 외부 사용자가 더 이상 접근할 수 없습니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '취소할 공유 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiResponse({
      status: 200,
      description: '공유 취소 성공',
      type: RevokeShareResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '소유자만 공유를 취소할 수 있음' }),
    ApiResponse({ status: 404, description: '공유를 찾을 수 없음' }),
  );

/**
 * 공유 가능한 외부 사용자 목록 API 문서
 */
export const ApiGetExternalUsers = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 가능한 외부 사용자 목록',
      description: '파일을 공유할 수 있는 활성화된 외부 사용자 목록을 조회합니다.',
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)' }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)' }),
    ApiResponse({
      status: 200,
      description: '외부 사용자 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ExternalUserListItemDto' },
          },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalItems: { type: 'integer' },
          totalPages: { type: 'integer' },
          hasNext: { type: 'boolean' },
          hasPrev: { type: 'boolean' },
        },
      },
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
  );
