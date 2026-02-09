/**
 * ShareRequest Controller Swagger 데코레이터
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
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateShareRequestDto } from './dto/create-share-request.dto';
import {
  ShareRequestResponseDto,
  CheckAvailabilityResponseDto,
} from './dto/share-request-response.dto';
import { ShareRequestStatus } from '../../../domain/share-request/type/share-request-status.enum';

/**
 * 가용성 확인 API 문서 (R-0)
 */
export const ApiCheckAvailability = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 가용성 확인',
      description: `
파일과 공유 대상에 대한 가용성을 확인합니다.

### 확인 항목
- 활성 공유 존재 여부 (ACTIVE_SHARE_EXISTS)
- 대기 중인 요청 존재 여부 (PENDING_REQUEST_EXISTS)
- 가용 여부 (AVAILABLE)

### 응답
- \`available\`: 모든 조합이 AVAILABLE이면 true
- \`results\`: 각 (파일, 대상) 조합별 상세 결과

### 주의사항
- 실제 공유 요청을 생성하기 전에 사전 확인용으로 사용합니다.
- 충돌이 있는 경우 상세 정보를 제공합니다.
      `,
    }),
    ApiBody({
      description: '가용성 확인 정보',
      type: CheckAvailabilityDto,
    }),
    ApiResponse({
      status: 200,
      description: '가용성 확인 성공',
      type: CheckAvailabilityResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (필수 필드 누락 또는 유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
  );

/**
 * 공유 요청 생성 API 문서 (R-1)
 */
export const ApiCreateShareRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 요청 생성',
      description: `
파일 공유를 요청합니다.

### 권한 요구사항
- \`FILE_SHARE_DIRECT\`: 즉시 승인 및 공유 생성
- \`FILE_SHARE_REQUEST\`: 승인 대기 상태로 저장

### 권한 (permission)
- \`VIEW\`: 뷰어에서 파일 보기만 가능
- \`DOWNLOAD\`: 파일 다운로드 가능 (maxDownloads 설정 가능)

### 자동 승인
- \`FILE_SHARE_DIRECT\` 권한이 있으면 즉시 승인되어 PublicShare가 생성됩니다.
- 그 외의 경우 PENDING 상태로 저장되어 승인자 승인을 기다립니다.

### 주의사항
- 동일한 파일을 같은 대상 사용자에게 중복 공유할 수 없습니다.
- 시작일시는 종료일시보다 이전이어야 합니다.
- 파일과 대상 사용자는 유효해야 합니다.
      `,
    }),
    ApiBody({
      description: '공유 요청 생성 정보',
      type: CreateShareRequestDto,
    }),
    ApiResponse({
      status: 201,
      description: '공유 요청 생성 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (필수 필드 누락 또는 유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '권한 없음 (FILE_SHARE_DIRECT 또는 FILE_SHARE_REQUEST 필요)' }),
    ApiResponse({ status: 404, description: '파일 또는 대상 사용자를 찾을 수 없음' }),
    ApiResponse({ status: 409, description: '이미 활성 공유 또는 대기 중인 요청이 존재함' }),
  );

/**
 * 내 공유 요청 목록 조회 API 문서 (R-2)
 */
export const ApiGetMyShareRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '내 공유 요청 목록',
      description: `
내가 생성한 공유 요청 목록을 페이지네이션으로 조회합니다.

### 필터
- \`status\`: 요청 상태로 필터링 (PENDING, APPROVED, REJECTED, CANCELED)

### 정렬
- \`sortBy\`: 정렬 기준 필드 (기본값: requestedAt)
- \`sortOrder\`: 정렬 순서 (asc/desc, 기본값: desc)
      `,
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiQuery({ name: 'sortBy', type: String, required: false, description: '정렬 기준 필드', example: 'requestedAt' }),
    ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false, description: '정렬 순서' }),
    ApiQuery({
      name: 'status',
      enum: ShareRequestStatus,
      required: false,
      description: '요청 상태 필터',
      example: ShareRequestStatus.PENDING,
    }),
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
  );

/**
 * 내 공유 요청 상세 조회 API 문서 (R-3)
 */
export const ApiGetMyShareRequestDetail = () =>
  applyDecorators(
    ApiOperation({
      summary: '내 공유 요청 상세 조회',
      description: '본인이 요청한 공유 요청의 상세 정보를 조회합니다.',
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
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '본인이 요청한 공유만 조회할 수 있음' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );

/**
 * 내 공유 요청 취소 API 문서 (R-4)
 */
export const ApiCancelMyShareRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '내 공유 요청 취소',
      description: `
본인이 요청한 공유 요청을 취소합니다.

### 주의사항
- PENDING 상태의 요청만 취소할 수 있습니다.
- 본인이 요청한 공유만 취소할 수 있습니다.
- 취소된 요청은 더 이상 승인될 수 없습니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '취소할 공유 요청 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '공유 요청 취소 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 400, description: '취소할 수 없는 상태 (이미 승인/거부/취소됨)' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '본인이 요청한 공유만 취소할 수 있음' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );
