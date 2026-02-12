/**
 * ShareRequestCreateController Swagger 데코레이터
 * 700. 파일 공유 요청 생성 API 문서
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CheckAvailabilityDto } from '../share-request/dto/check-availability.dto';
import { CreateShareRequestDto } from '../share-request/dto/create-share-request.dto';
import {
  ShareRequestResponseDto,
  CheckAvailabilityResponseDto,
} from '../share-request/dto/share-request-response.dto';

/**
 * 공유 대상자 통합 조회 API 문서 (R-T)
 */
export const ApiGetShareTargetUsers = () =>
  applyDecorators(
    ApiOperation({
      summary: '공유 대상자 조회 (내부 + 외부)',
      description: `
파일 공유 대상자를 검색합니다. 내부 사용자와 외부 사용자를 통합하여 조회합니다.

### 필터
- \`type\`: INTERNAL(내부) / EXTERNAL(외부) - 미지정 시 전체
- \`name\`: 이름 부분 일치
- \`department\`: 부서명 부분 일치
- \`email\`: 이메일 부분 일치

### 사용자 유형 구분
- **INTERNAL**: 내부 직원 (일반 부서 소속)
- **EXTERNAL**: 외부 사용자 (외부 부서 소속)

### 조건
- 재직중인 사용자만 반환됩니다.
      `,
    }),
    ApiQuery({ name: 'type', enum: ['INTERNAL', 'EXTERNAL'], required: false, description: '사용자 유형 (미지정 시 전체)' }),
    ApiQuery({ name: 'name', type: String, required: false, description: '이름 (부분 일치)' }),
    ApiQuery({ name: 'department', type: String, required: false, description: '부서명 (부분 일치)' }),
    ApiQuery({ name: 'email', type: String, required: false, description: '이메일 (부분 일치)' }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)' }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)' }),
    ApiResponse({
      status: 200,
      description: '공유 대상자 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ShareTargetUserDto' },
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
 * 승인 가능 사용자 검색 API 문서 (R-A)
 */
export const ApiGetApprovers = () =>
  applyDecorators(
    ApiOperation({
      summary: '승인 가능 사용자 검색',
      description: `
공유 요청 생성 시 승인 대상자를 검색합니다.

### 대상
- 매니저(MANAGER) 이상 역할을 가진 활성 사용자만 반환됩니다.

### 검색
- \`keyword\`: 통합 검색 키워드 (이름, 부서명, 이메일, 사번에서 OR 조건 ILIKE 검색)
- 미입력 시 전체 목록을 반환합니다.

### 응답
- 사용자 기본 정보 (이름, 이메일, 사번)
- 부서명, 직책
- 역할 정보 (id, name, description)
      `,
    }),
    ApiQuery({ name: 'keyword', type: String, required: false, description: '통합 검색 키워드 (이름, 부서명, 이메일, 사번)', example: '김' }),
    ApiQuery({ name: 'page', type: Number, required: false, description: '페이지 번호 (기본값: 1)', example: 1 }),
    ApiQuery({ name: 'pageSize', type: Number, required: false, description: '페이지 크기 (기본값: 20)', example: 20 }),
    ApiResponse({
      status: 200,
      description: '승인 가능 사용자 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ApproverResponseDto' },
          },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          totalItems: { type: 'integer', example: 15 },
          totalPages: { type: 'integer', example: 1 },
          hasNext: { type: 'boolean', example: false },
          hasPrev: { type: 'boolean', example: false },
        },
      },
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
  );

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

### 사전 확인
- 공유 요청 전 \`GET /v1/users/me/permissions\` 를 호출하여 사용자 권한을 확인하세요.
- \`FILE_SHARE_DIRECT\` 권한이 있으면 승인 대상자 선택 UI를 생략할 수 있습니다.

### 권한에 따른 동작
| 권한 | designatedApproverId | 결과 |
|------|---------------------|------|
| \`FILE_SHARE_DIRECT\` | 생략 가능 (무시됨) | 즉시 승인 및 PublicShare 생성 |
| \`FILE_SHARE_REQUEST\` | **필수** | PENDING 상태 저장 → 승인 대기 |

### 공유 권한 (permission)
- \`VIEW\`: 뷰어에서 파일 보기만 가능
- \`DOWNLOAD\`: 파일 다운로드 가능 (maxDownloads 설정 가능)

### 주의사항
- 동일한 파일을 같은 대상 사용자에게 중복 공유할 수 없습니다.
- 시작일시는 종료일시보다 이전이어야 합니다.
- 파일과 대상 사용자는 유효해야 합니다.
- \`FILE_SHARE_REQUEST\` 권한만 있는 경우 \`designatedApproverId\`를 누락하면 403 에러가 발생합니다.

### 응답 Enriched 데이터
응답에 파일/사용자 상세 정보가 포함됩니다:
- \`files\`: 공유 파일 상세 (이름, MIME타입, 크기)
- \`requesterDetail\`: 요청자 정보 (이름, 부서, 이메일)
- \`targetDetails\`: 대상자 정보 (이름, 부서, 이메일)
- \`designatedApproverDetail\`: 지정 승인자 정보
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
