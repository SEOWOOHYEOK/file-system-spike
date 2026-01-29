/**
 * Share Admin Controller Swagger 데코레이터
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
  AdminShareDetailResponseDto,
  ShareBlockResponseDto,
  BulkBlockResponseDto,
  BulkUnblockResponseDto,
  SharedFileStatsDto,
} from './dto';
import { PublicShareListItemDto } from '../../share/dto';
import { PaginatedResponseDto } from '../../../common/dto';

/**
 * 전체 공유 현황 조회 API 문서
 */
export const ApiGetAllPublicShares = () =>
  applyDecorators(
    ApiOperation({
      summary: '전체 공유 현황 조회',
      description: `
관리자가 시스템 내 전체 공유 현황을 페이지네이션으로 조회합니다.

### 정렬
- \`sortBy\`: 정렬 기준 필드 (기본값: createdAt)
- \`sortOrder\`: 정렬 순서 (asc/desc, 기본값: desc)

### 반환 정보
- 공유 ID, 파일 ID, 소유자 ID, 외부 사용자 ID
- 권한, 뷰/다운로드 횟수, 차단/취소 상태
      `,
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiQuery({ name: 'sortBy', type: String, required: false, description: '정렬 기준 필드', example: 'createdAt' }),
    ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false, description: '정렬 순서' }),
    ApiResponse({
      status: 200,
      description: '전체 공유 현황 조회 성공',
      schema: {
        allOf: [
          { $ref: '#/components/schemas/PaginatedResponseDto' },
          {
            properties: {
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/PublicShareListItemDto' },
              },
            },
          },
        ],
      },
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * 공유 상세 조회 API 문서 (관리자용)
 */
export const ApiGetPublicShareByIdAdmin = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 상세 조회',
      description: '특정 공유의 상세 정보를 조회합니다. 관리자만 접근 가능합니다.',
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
      type: AdminShareDetailResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '공유를 찾을 수 없음' }),
  );

/**
 * 공유 차단 API 문서
 */
export const ApiBlockShare = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 차단',
      description: `
특정 공유를 차단합니다.

### 차단 효과
- 외부 사용자가 해당 공유를 통해 파일에 접근할 수 없습니다.
- 차단 일시와 차단자 정보가 기록됩니다.

### 주의사항
- 이미 취소된 공유는 차단할 필요가 없습니다.
- 차단된 공유는 unblock API로 해제할 수 있습니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '차단할 공유 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiResponse({
      status: 200,
      description: '공유 차단 성공',
      type: ShareBlockResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '공유를 찾을 수 없음' }),
  );

/**
 * 차단 해제 API 문서
 */
export const ApiUnblockShare = () =>
  applyDecorators(
    ApiOperation({
      summary: '차단 해제',
      description: `
차단된 공유를 해제합니다.

### 해제 효과
- 외부 사용자가 다시 파일에 접근할 수 있습니다.
- 차단 일시와 차단자 정보가 초기화됩니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '차단 해제할 공유 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiResponse({
      status: 200,
      description: '차단 해제 성공',
      type: ShareBlockResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '공유를 찾을 수 없음' }),
  );

/**
 * 공유된 파일 목록 조회 API 문서
 */
export const ApiGetSharedFiles = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유된 파일 목록 조회',
      description: `
공유된 파일들의 통계 정보를 조회합니다.

### 반환 정보
- 파일별 총 공유 수, 활성/차단/취소된 공유 수
- 파일별 총 뷰/다운로드 횟수
      `,
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiResponse({
      status: 200,
      description: '공유된 파일 목록 조회 성공',
      schema: {
        allOf: [
          { $ref: '#/components/schemas/PaginatedResponseDto' },
          {
            properties: {
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/SharedFileStatsDto' },
              },
            },
          },
        ],
      },
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * 특정 파일의 공유 목록 API 문서
 */
export const ApiGetSharesByFile = () =>
  applyDecorators(
    ApiOperation({
      summary: '특정 파일의 공유 목록',
      description: '특정 파일에 대한 모든 공유 목록을 조회합니다.',
    }),
    ApiParam({
      name: 'fileId',
      type: String,
      description: '파일 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '파일의 공유 목록 조회 성공',
      type: [AdminShareDetailResponseDto],
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * 특정 파일의 모든 공유 일괄 차단 API 문서
 */
export const ApiBlockAllSharesByFile = () =>
  applyDecorators(
    ApiOperation({
      summary: '특정 파일의 모든 공유 일괄 차단',
      description: `
특정 파일에 대한 모든 활성 공유를 일괄 차단합니다.

### 사용 시나리오
- 보안 이슈로 인해 파일 접근을 긴급 차단해야 할 때
- 파일 내용에 문제가 발견되어 모든 외부 접근을 막아야 할 때

### 주의사항
- 이미 취소된 공유는 영향받지 않습니다.
- 차단된 공유 수가 반환됩니다.
      `,
    }),
    ApiParam({
      name: 'fileId',
      type: String,
      description: '파일 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '일괄 차단 성공',
      type: BulkBlockResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * 특정 파일의 모든 공유 일괄 차단 해제 API 문서
 */
export const ApiUnblockAllSharesByFile = () =>
  applyDecorators(
    ApiOperation({
      summary: '특정 파일의 모든 공유 일괄 차단 해제',
      description: '특정 파일에 대한 모든 차단된 공유를 일괄 해제합니다.',
    }),
    ApiParam({
      name: 'fileId',
      type: String,
      description: '파일 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '일괄 차단 해제 성공',
      type: BulkUnblockResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * 특정 외부 사용자의 모든 공유 일괄 차단 API 문서
 */
export const ApiBlockAllSharesByExternalUser = () =>
  applyDecorators(
    ApiOperation({
      summary: '특정 외부 사용자의 모든 공유 일괄 차단',
      description: `
특정 외부 사용자에게 공유된 모든 파일을 일괄 차단합니다.

### 사용 시나리오
- 외부 사용자 계정이 침해되었을 때
- 외부 사용자와의 협력 관계가 종료되었을 때
- 보안 감사에서 문제가 발견되었을 때

### 주의사항
- 계정 비활성화와 별개로 공유 차단이 필요합니다.
- 차단된 공유 수가 반환됩니다.
      `,
    }),
    ApiParam({
      name: 'userId',
      type: String,
      description: '외부 사용자 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440002',
    }),
    ApiResponse({
      status: 200,
      description: '일괄 차단 성공',
      type: BulkBlockResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );
