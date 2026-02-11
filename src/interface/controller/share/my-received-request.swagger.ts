/**
 * MyReceivedRequest Controller Swagger 데코레이터
 *
 * 702.내가 받은 공유 요청 관리 API 문서
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ShareRequestResponseDto } from '../share-request/dto/share-request-response.dto';
import { ShareRequestStatus } from '../../../domain/share-request/type/share-request-status.enum';
import {
  ApproveReceivedRequestDto,
  RejectReceivedRequestDto,
} from './dto/received-request.dto';

/**
 * 받은 공유 요청 목록 조회 API 문서 (R-2)
 */
export const ApiGetReceivedRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '받은 공유 요청 목록',
      description: `
본인에게 지정된(designatedApproverId) 공유 요청 목록을 페이지네이션으로 조회합니다.

### 필터
- \`status\`: 요청 상태로 필터링 (PENDING, APPROVED, REJECTED, CANCELED)
- 미지정 시 PENDING만 조회 (승인 대기 중인 요청)

### 정렬
- \`sortBy\`: 정렬 기준 필드 (기본값: requestedAt)
- \`sortOrder\`: 정렬 순서 (asc/desc, 기본값: desc)
      `,
    }),
    ApiQuery({
      name: 'status',
      enum: ShareRequestStatus,
      required: false,
      description: '요청 상태 필터 (미지정 시 PENDING)',
      example: ShareRequestStatus.PENDING,
    }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiQuery({ name: 'sortBy', type: String, required: false, description: '정렬 기준 필드', example: 'requestedAt' }),
    ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false, description: '정렬 순서' }),
    ApiResponse({
      status: 200,
      description: '받은 공유 요청 목록 조회 성공',
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
 * 받은 공유 요청 상세 조회 API 문서 (R-3)
 */
export const ApiGetReceivedRequestDetail = () =>
  applyDecorators(
    ApiOperation({
      summary: '받은 공유 요청 상세 조회',
      description: '본인에게 지정된 공유 요청의 상세 정보를 조회합니다.',
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '공유 요청 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '받은 공유 요청 상세 조회 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '본인에게 지정된 공유 요청만 조회할 수 있음' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );

/**
 * 받은 공유 요청 승인 API 문서 (R-4)
 */
export const ApiApproveReceivedRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '받은 공유 요청 승인',
      description: `
본인에게 지정된 공유 요청을 승인합니다.

### 주의사항
- PENDING 상태의 요청만 승인할 수 있습니다.
- 본인에게 지정된(designatedApproverId) 공유 요청만 승인할 수 있습니다.
- 승인 시 PublicShare가 생성됩니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '승인할 공유 요청 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiBody({
      description: '승인 정보',
      type: ApproveReceivedRequestDto,
    }),
    ApiResponse({
      status: 200,
      description: '승인 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 400, description: '승인할 수 없는 상태 (이미 승인/거부/취소됨)' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '본인에게 지정된 공유 요청만 승인할 수 있음' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );

/**
 * 받은 공유 요청 반려 API 문서 (R-5)
 */
export const ApiRejectReceivedRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '받은 공유 요청 반려',
      description: `
본인에게 지정된 공유 요청을 반려합니다.

### 주의사항
- PENDING 상태의 요청만 반려할 수 있습니다.
- 본인에게 지정된(designatedApproverId) 공유 요청만 반려할 수 있습니다.
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
      description: '반려 정보 (comment 필수)',
      type: RejectReceivedRequestDto,
    }),
    ApiResponse({
      status: 200,
      description: '반려 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({ status: 400, description: '반려할 수 없는 상태 또는 반려 코멘트 누락' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 403, description: '본인에게 지정된 공유 요청만 반려할 수 있음' }),
    ApiResponse({ status: 404, description: '공유 요청을 찾을 수 없음' }),
  );
