/**
 * ShareRequest Admin Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import {
  ShareRequestSummaryDto,
  ShareRequestAdminDetailDto,
  BulkDecisionResponseDto,
  SharesByTargetResponseDto,
  SharesByFileResponseDto,
  ApproveRequestDto,
  RejectRequestDto,
  BulkApproveRequestDto,
  BulkRejectRequestDto,
} from './dto';
import { ShareRequestResponseDto } from '../../share-request/dto/share-request-response.dto';

/**
 * A-1: 상태별 카운트 조회 API 문서
 */
export const ApiGetShareRequestSummary = () =>
  applyDecorators(
    ApiOperation({
      summary: '상태별 공유 요청 카운트 조회',
      description: `
관리자가 공유 요청의 상태별 개수를 조회합니다.

### 반환 정보
- PENDING: 대기 중인 요청 수
- APPROVED: 승인된 요청 수
- REJECTED: 반려된 요청 수
- CANCELED: 취소된 요청 수
      `,
    }),
    ApiResponse({
      status: 200,
      description: '상태별 카운트 조회 성공',
      type: ShareRequestSummaryDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * A-2: 요청 목록 조회 API 문서
 */
export const ApiGetShareRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 목록 조회',
      description: `
관리자가 공유 요청 목록을 필터링 및 페이지네이션으로 조회합니다.

### 필터 옵션
- status: 요청 상태 (필수)
- q: 검색어 (파일명, 요청자명, 대상자명)
- requesterId: 요청자 ID
- fileId: 파일 ID
- targetUserId: 대상 사용자 ID
- requestedFrom/requestedTo: 요청일 범위
- periodFrom/periodTo: 공유 기간 범위
- sort: 정렬 필드 및 방향 (예: "requestedAt,desc")

### 정렬
- sort 파라미터: "필드명,방향" 형식 (예: "requestedAt,desc")
- 기본 정렬: requestedAt 내림차순
      `,
    }),
    ApiQuery({ name: 'status', enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'], required: true, description: '요청 상태 필터' }),
    ApiQuery({ name: 'q', type: String, required: false, description: '검색어 (파일명, 요청자명, 대상자명)' }),
    ApiQuery({ name: 'requesterId', type: String, required: false, description: '요청자 ID (UUID)' }),
    ApiQuery({ name: 'fileId', type: String, required: false, description: '파일 ID (UUID)' }),
    ApiQuery({ name: 'targetUserId', type: String, required: false, description: '대상 사용자 ID (UUID)' }),
    ApiQuery({ name: 'requestedFrom', type: String, required: false, description: '요청일 시작 (ISO 8601)' }),
    ApiQuery({ name: 'requestedTo', type: String, required: false, description: '요청일 종료 (ISO 8601)' }),
    ApiQuery({ name: 'periodFrom', type: String, required: false, description: '공유 기간 시작 (ISO 8601)' }),
    ApiQuery({ name: 'periodTo', type: String, required: false, description: '공유 기간 종료 (ISO 8601)' }),
    ApiQuery({ name: 'sort', type: String, required: false, description: '정렬 필드 및 방향 (예: "requestedAt,desc")' }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiQuery({ name: 'sortBy', type: String, required: false, description: '정렬 기준 필드' }),
    ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false, description: '정렬 순서' }),
    ApiResponse({
      status: 200,
      description: '공유 요청 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ShareRequestResponseDto' },
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
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * A-3: 요청 상세 조회 API 문서
 */
export const ApiGetShareRequestDetail = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 상세 조회',
      description: '특정 공유 요청의 상세 정보를 조회합니다. 관리자만 접근 가능합니다.',
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '공유 요청 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '공유 요청 상세 조회 성공',
      type: ShareRequestAdminDetailDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );

/**
 * A-4: 단건 승인 API 문서
 */
export const ApiApproveShareRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 승인',
      description: `
특정 공유 요청을 승인합니다.

### 승인 효과
- 요청 상태가 APPROVED로 변경됩니다.
- PublicShare가 생성되어 파일 공유가 활성화됩니다.
- 승인자 정보와 승인 일시가 기록됩니다.

### 주의사항
- PENDING 상태의 요청만 승인할 수 있습니다.
- 승인 코멘트는 선택사항입니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '승인할 공유 요청 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiBody({
      type: ApproveRequestDto,
      description: '승인 요청 본문',
    }),
    ApiResponse({
      status: 200,
      description: '공유 요청 승인 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 400, description: '승인할 수 없는 상태이거나 중복 요청' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );

/**
 * A-5: 단건 반려 API 문서
 */
export const ApiRejectShareRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 반려',
      description: `
특정 공유 요청을 반려합니다.

### 반려 효과
- 요청 상태가 REJECTED로 변경됩니다.
- 반려자 정보와 반려 일시가 기록됩니다.

### 주의사항
- PENDING 상태의 요청만 반려할 수 있습니다.
- 반려 코멘트는 필수입니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '반려할 공유 요청 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiBody({
      type: RejectRequestDto,
      description: '반려 요청 본문',
    }),
    ApiResponse({
      status: 200,
      description: '공유 요청 반려 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 400, description: '반려할 수 없는 상태' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );

/**
 * A-6: 일괄 승인 API 문서
 */
export const ApiBulkApproveShareRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 일괄 승인',
      description: `
여러 공유 요청을 한 번에 승인합니다.

### 승인 효과
- 모든 요청 상태가 APPROVED로 변경됩니다.
- 각 요청에 대해 PublicShare가 생성됩니다.
- 승인자 정보와 승인 일시가 기록됩니다.

### 사용 시나리오
- 대량의 요청을 효율적으로 처리할 때
- 정기적인 일괄 승인 작업이 필요할 때

### 주의사항
- PENDING 상태의 요청만 승인할 수 있습니다.
- 중복 요청이 있으면 전체 트랜잭션이 롤백됩니다.
- 승인 코멘트는 선택사항입니다.
      `,
    }),
    ApiBody({
      type: BulkApproveRequestDto,
      description: '일괄 승인 요청 본문',
    }),
    ApiResponse({
      status: 200,
      description: '일괄 승인 성공',
      type: BulkDecisionResponseDto,
    }),
    ApiResponse({ status: 400, description: '승인할 수 없는 상태이거나 중복 요청' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * A-7: 일괄 반려 API 문서
 */
export const ApiBulkRejectShareRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 일괄 반려',
      description: `
여러 공유 요청을 한 번에 반려합니다.

### 반려 효과
- 모든 요청 상태가 REJECTED로 변경됩니다.
- 반려자 정보와 반려 일시가 기록됩니다.

### 사용 시나리오
- 대량의 요청을 효율적으로 처리할 때
- 정책 위반 요청을 일괄 반려할 때

### 주의사항
- PENDING 상태의 요청만 반려할 수 있습니다.
- 반려 코멘트는 필수입니다.
      `,
    }),
    ApiBody({
      type: BulkRejectRequestDto,
      description: '일괄 반려 요청 본문',
    }),
    ApiResponse({
      status: 200,
      description: '일괄 반려 성공',
      type: BulkDecisionResponseDto,
    }),
    ApiResponse({ status: 400, description: '반려할 수 없는 상태' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
  );

/**
 * Q-1: 대상자별 조회 API 문서
 */
export const ApiGetSharesByTarget = () =>
  applyDecorators(
    ApiOperation({
      summary: '대상자별 공유 조회',
      description: `
특정 사용자에게 공유된 파일 목록을 조회합니다.

### 반환 정보
- 활성 공유 (PublicShare)
- 대기 중인 요청 (ShareRequest)
- 대상 사용자 정보
- 요약 통계 (활성 공유 수, 대기 요청 수, 총 뷰/다운로드 횟수)

### 사용 시나리오
- 특정 사용자가 접근 가능한 모든 파일 확인
- 사용자별 공유 현황 모니터링
      `,
    }),
    ApiParam({
      name: 'userId',
      type: String,
      description: '대상 사용자 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiResponse({
      status: 200,
      description: '대상자별 공유 조회 성공',
      type: SharesByTargetResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '사용자를 찾을 수 없음' }),
  );

/**
 * Q-2: 파일별 조회 API 문서
 */
export const ApiGetSharesByFile = () =>
  applyDecorators(
    ApiOperation({
      summary: '파일별 공유 조회',
      description: `
특정 파일에 대한 공유 목록을 조회합니다.

### 반환 정보
- 활성 공유 (PublicShare)
- 대기 중인 요청 (ShareRequest)
- 파일 정보
- 요약 통계 (활성 공유 수, 대기 요청 수, 총 뷰/다운로드 횟수)

### 사용 시나리오
- 특정 파일이 누구에게 공유되었는지 확인
- 파일별 공유 현황 모니터링
      `,
    }),
    ApiParam({
      name: 'fileId',
      type: String,
      description: '파일 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiResponse({
      status: 200,
      description: '파일별 공유 조회 성공',
      type: SharesByFileResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '관리자 권한 필요' }),
    ApiResponse({ status: 404, description: '파일을 찾을 수 없음' }),
  );
