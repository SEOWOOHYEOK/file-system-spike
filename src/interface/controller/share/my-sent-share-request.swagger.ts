/**
 * MySentShareRequest Controller Swagger 데코레이터
 * 701-A.내가 보낸 결제 요청 관리 API 문서
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ShareRequestResponseDto } from '../share-request/dto/share-request-response.dto';
import { MySentShareItemDto } from './dto/my-sent-share-item.dto';

/**
 * 결제 요청 목록 API 문서
 */
export const ApiGetMySentShareRequests = () =>
  applyDecorators(
    ApiOperation({
      summary: '내가 보낸 결제 요청 목록',
      description: `
내가 보낸 결제 요청(ShareRequest) 목록을 조회합니다.

### 상태 필터 (status)
- **PENDING**: 대기 중
- **APPROVED**: 승인됨
- **REJECTED**: 거부됨
- **CANCELED**: 취소됨
- 미지정 시: 모든 상태 조회
      `,
    }),
    ApiQuery({
      name: 'status',
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'],
      required: false,
      description: '상태 필터',
    }),
    ApiQuery({
      name: 'page',
      type: Number,
      required: false,
      description: '페이지 번호 (기본값: 1)',
      example: 1,
    }),
    ApiQuery({
      name: 'pageSize',
      type: Number,
      required: false,
      description: '페이지 크기 (기본값: 20)',
      example: 20,
    }),
    ApiQuery({
      name: 'sortBy',
      type: String,
      required: false,
      description: '정렬 기준 필드 (기본값: createdAt)',
    }),
    ApiQuery({
      name: 'sortOrder',
      enum: ['asc', 'desc'],
      required: false,
      description: '정렬 순서',
    }),
    ApiResponse({
      status: 200,
      description: '결제 요청 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/MySentShareItemDto' },
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
 * 결제 요청 취소 API 문서
 */
export const ApiCancelMySentShareRequest = () =>
  applyDecorators(
    ApiOperation({
      summary: '결제 요청 취소',
      description: `
PENDING 상태의 결제 요청(ShareRequest)을 취소합니다.

### 주의사항
- PENDING 상태의 ShareRequest만 취소 가능
- 본인이 요청한 항목만 취소 가능
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '취소할 결제 요청 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiResponse({
      status: 200,
      description: '결제 요청 취소 성공',
      type: ShareRequestResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: '취소할 수 없는 상태 (이미 승인/거부/취소됨)',
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({
      status: 403,
      description: '본인이 요청한 결제만 취소 가능',
    }),
    ApiResponse({ status: 404, description: '결제 요청을 찾을 수 없음' }),
  );
