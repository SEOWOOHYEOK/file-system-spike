/**
 * MySentShare Controller Swagger 데코레이터
 * 701.내가 보낸 공유 관리 API 문서
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiExtraModels,
} from '@nestjs/swagger';
import {
  PublicShareResponseDto,
  RevokeShareResponseDto,
} from './dto/public-share-response.dto';
import { ShareRequestResponseDto } from '../share-request/dto/share-request-response.dto';
import { MySentShareItemDto } from './dto/my-sent-share-item.dto';

/**
 * S-1: 내 공유 통합 목록 API 문서
 */
export const ApiGetMySentShareList = () =>
  applyDecorators(
    ApiOperation({
      summary: '내 공유 통합 목록',
      description: `
내가 보낸 공유(ShareRequest + PublicShare)를 통합하여 조회합니다.

### 상태 필터 (status)
- **ShareRequest**: PENDING, APPROVED, REJECTED, CANCELED
- **PublicShare**: ACTIVE, REVOKED
- 미지정 시: ShareRequest와 PublicShare 모두 조회 (병합 후 정렬)

### 응답
- \`source\`: SHARE_REQUEST | PUBLIC_SHARE
- \`status\`: ShareRequest는 요청 상태, PublicShare는 ACTIVE/REVOKED
      `,
    }),
    ApiQuery({
      name: 'status',
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'ACTIVE', 'REVOKED'],
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
      description: '내 공유 통합 목록 조회 성공',
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
 * S-2: 공유 상세 조회 API 문서
 */
export const ApiGetMySentShareDetail = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 상세 조회',
      description: '특정 공유(PublicShare)의 상세 정보를 조회합니다.',
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
 * S-3: 공유 취소/철회 API 문서
 */
export const ApiCancelMySentShare = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 취소/철회',
      description: `
공유를 취소하거나 철회합니다. ID에 따라 자동 분기됩니다.

### 분기 로직
1. **ShareRequest (PENDING)** → 요청 취소 (cancel)
2. **PublicShare (ACTIVE)** → 공유 철회 (revoke)
3. **그 외** → 404

### 주의사항
- PENDING 상태의 ShareRequest만 취소 가능
- ACTIVE 상태의 PublicShare만 철회 가능
- 본인이 요청/소유한 항목만 취소/철회 가능
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '취소/철회할 공유 ID (ShareRequest 또는 PublicShare UUID)',
      example: '550e8400-e29b-41d4-a716-446655440003',
    }),
    ApiExtraModels(ShareRequestResponseDto, RevokeShareResponseDto),
    ApiResponse({
      status: 200,
      description: '공유 취소/철회 성공 (ShareRequest 또는 PublicShare 응답)',
      schema: {
        oneOf: [
          { $ref: '#/components/schemas/ShareRequestResponseDto' },
          { $ref: '#/components/schemas/RevokeShareResponseDto' },
        ],
      },
    }),
    ApiResponse({
      status: 400,
      description: '취소할 수 없는 상태 (이미 승인/거부/취소됨)',
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({
      status: 403,
      description: '본인이 요청/소유한 공유만 취소/철회 가능',
    }),
    ApiResponse({ status: 404, description: '공유를 찾을 수 없음' }),
  );
