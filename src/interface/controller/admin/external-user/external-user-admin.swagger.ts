/**
 * External User Admin Controller Swagger 데코레이터
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
  ExternalUserResponseDto,
  ExternalUserStatusResponseDto,
  ResetPasswordResponseDto,
} from './dto/external-user-response.dto';
import { CreateExternalUserRequestDto } from './dto/create-external-user.dto';
import { UpdateExternalUserRequestDto } from './dto/update-external-user.dto';

/**
 * 외부 사용자 생성 API 문서
 */
export const ApiCreateExternalUser = () =>
  applyDecorators(
    ApiOperation({
      summary: '외부 사용자 생성',
      description: `
새로운 외부 사용자 계정을 생성합니다.

### 필수 필드
- \`username\`: 로그인용 사용자명 (고유, 영문자/숫자/언더스코어만 허용)
- \`password\`: 비밀번호 (최소 8자, 대소문자 및 숫자 포함)
- \`name\`: 실명
- \`email\`: 이메일 주소

### 선택 필드
- \`company\`: 소속 회사명
- \`phone\`: 연락처

### 주의사항
- username은 중복될 수 없습니다.
- 생성된 계정은 기본적으로 활성화 상태입니다.
      `,
    }),
    ApiBody({
      description: '외부 사용자 생성 정보',
      type: CreateExternalUserRequestDto,
    }),
    ApiResponse({
      status: 201,
      description: '외부 사용자 생성 성공',
      type: ExternalUserResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (필수 필드 누락 또는 유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 409, description: 'username이 이미 존재함' }),
  );

/**
 * 외부 사용자 목록 조회 API 문서
 */
export const ApiGetExternalUsers = () =>
  applyDecorators(
    ApiOperation({
      summary: '외부 사용자 목록 조회',
      description: `
외부 사용자 목록을 페이지네이션으로 조회합니다.

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
      description: '외부 사용자 목록 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ExternalUserListItemDto' },
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
 * 외부 사용자 상세 조회 API 문서
 */
export const ApiGetExternalUserById = () =>
  applyDecorators(
    ApiOperation({
      summary: '외부 사용자 상세 조회',
      description: '특정 외부 사용자의 상세 정보를 조회합니다.',
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '외부 사용자 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '외부 사용자 상세 조회 성공',
      type: ExternalUserResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '외부 사용자를 찾을 수 없음' }),
  );

/**
 * 외부 사용자 정보 수정 API 문서
 */
export const ApiUpdateExternalUser = () =>
  applyDecorators(
    ApiOperation({
      summary: '외부 사용자 정보 수정',
      description: `
외부 사용자의 기본 정보를 수정합니다.

### 수정 가능한 필드
- \`name\`: 실명
- \`email\`: 이메일 주소
- \`company\`: 소속 회사명
- \`phone\`: 연락처

### 주의사항
- username과 password는 이 API로 변경할 수 없습니다.
- 비밀번호 변경은 비밀번호 초기화 API를 사용하세요.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '외부 사용자 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiBody({
      description: '수정할 정보',
      type: UpdateExternalUserRequestDto,
    }),
    ApiResponse({
      status: 200,
      description: '외부 사용자 정보 수정 성공',
      type: ExternalUserResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '외부 사용자를 찾을 수 없음' }),
  );

/**
 * 계정 비활성화 API 문서
 */
export const ApiDeactivateUser = () =>
  applyDecorators(
    ApiOperation({
      summary: '외부 사용자 계정 비활성화',
      description: `
외부 사용자 계정을 비활성화합니다.

### 비활성화 효과
- 해당 사용자는 더 이상 로그인할 수 없습니다.
- 해당 사용자에게 공유된 파일 접근이 불가능해집니다.
- 새로운 공유를 받을 수 없습니다.

### 주의사항
- 비활성화된 계정은 다시 활성화할 수 있습니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '외부 사용자 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '계정 비활성화 성공',
      type: ExternalUserStatusResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '외부 사용자를 찾을 수 없음' }),
  );

/**
 * 계정 활성화 API 문서
 */
export const ApiActivateUser = () =>
  applyDecorators(
    ApiOperation({
      summary: '외부 사용자 계정 활성화',
      description: `
비활성화된 외부 사용자 계정을 다시 활성화합니다.

### 활성화 효과
- 해당 사용자가 다시 로그인할 수 있습니다.
- 이전에 공유된 파일에 다시 접근할 수 있습니다.
- 새로운 공유를 받을 수 있습니다.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '외부 사용자 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '계정 활성화 성공',
      type: ExternalUserStatusResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '외부 사용자를 찾을 수 없음' }),
  );

/**
 * 비밀번호 초기화 API 문서
 */
export const ApiResetPassword = () =>
  applyDecorators(
    ApiOperation({
      summary: '비밀번호 초기화',
      description: `
외부 사용자의 비밀번호를 임시 비밀번호로 초기화합니다.

### 동작 방식
- 12자리 임시 비밀번호가 자동 생성됩니다.
- 생성된 임시 비밀번호는 응답으로 반환됩니다.
- 사용자에게 임시 비밀번호를 별도로 전달해야 합니다.

### 주의사항
- 임시 비밀번호는 이 응답에서만 확인 가능합니다.
- 반드시 사용자에게 비밀번호 변경을 안내하세요.
      `,
    }),
    ApiParam({
      name: 'id',
      type: String,
      description: '외부 사용자 ID (UUID)',
      example: '550e8400-e29b-41d4-a716-446655440001',
    }),
    ApiResponse({
      status: 200,
      description: '비밀번호 초기화 성공',
      type: ResetPasswordResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '외부 사용자를 찾을 수 없음' }),
  );
