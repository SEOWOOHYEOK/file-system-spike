/**
 * External Auth Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import {
  ExternalLoginRequestDto,
  ExternalLoginResponseDto,
} from './dto/external-login.dto';
import {
  ChangePasswordRequestDto,
  ChangePasswordResponseDto,
} from './dto/change-password.dto';
import {
  ExternalRefreshTokenRequestDto,
  ExternalRefreshTokenResponseDto,
  ExternalLogoutResponseDto,
} from './dto/refresh-token.dto';

/**
 * 외부 사용자 로그인 API 문서
 */
export const ApiExternalLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: '외부 사용자 로그인',
      description: `
외부 사용자 계정으로 로그인하고 JWT 토큰을 발급받습니다.

### 보안 기능
- **로그인 실패 제한**: 5회 연속 실패 시 30분간 계정 잠금
- **이중 토큰 발급**: Access Token (15분) + Refresh Token (7일)

### 요청
- \`username\`: 외부 사용자 아이디 (3-50자)
- \`password\`: 비밀번호 (6자 이상)

### 응답
- \`accessToken\`: Access Token (15분 유효, API 호출용)
- \`refreshToken\`: Refresh Token (7일 유효, 토큰 갱신용)
- \`expiresIn\`: Access Token 만료 시간 (초)
- \`user\`: 사용자 기본 정보

### 주의사항
- 비활성화된 계정은 로그인할 수 없습니다.
- 5회 연속 실패 시 30분간 로그인이 차단됩니다.
      `,
    }),
    ApiBody({
      description: '로그인 정보',
      type: ExternalLoginRequestDto,
    }),
    ApiResponse({
      status: 200,
      description: '로그인 성공',
      type: ExternalLoginResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '인증 실패 (잘못된 아이디 또는 비밀번호)' }),
    ApiResponse({ status: 403, description: '계정이 비활성화됨 또는 잠금됨 (5회 실패)' }),
  );

/**
 * Refresh Token API 문서
 */
export const ApiRefreshToken = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Access Token 갱신',
      description: `
Refresh Token을 사용하여 새로운 Access Token을 발급받습니다.

### 사용 시나리오
1. Access Token이 만료됨 (15분)
2. Refresh Token으로 새 Access Token 발급
3. 새 Access Token으로 API 호출 계속

### 주의사항
- Refresh Token이 만료되면 (7일) 다시 로그인해야 합니다.
- 로그아웃된 Refresh Token은 사용할 수 없습니다.
      `,
    }),
    ApiBody({
      description: 'Refresh Token',
      type: ExternalRefreshTokenRequestDto,
    }),
    ApiResponse({
      status: 200,
      description: '토큰 갱신 성공',
      type: ExternalRefreshTokenResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '유효하지 않거나 만료된 Refresh Token' }),
    ApiResponse({ status: 403, description: '계정이 비활성화됨' }),
  );

/**
 * 로그아웃 API 문서
 */
export const ApiExternalLogout = () =>
  applyDecorators(
    ApiOperation({
      summary: '로그아웃',
      description: `
로그아웃 처리를 합니다.

### 보안 동작
- 현재 사용 중인 Access Token이 블랙리스트에 추가됩니다.
- 블랙리스트에 추가된 토큰은 만료 전이라도 사용할 수 없습니다.
- 클라이언트에서도 저장된 토큰을 삭제해야 합니다.

### 주의사항
- 로그아웃 후에는 새로 로그인해야 합니다.
- Refresh Token으로 토큰을 갱신해도 차단됩니다.
      `,
    }),
    ApiResponse({
      status: 200,
      description: '로그아웃 성공',
      type: ExternalLogoutResponseDto,
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
  );

/**
 * 비밀번호 변경 API 문서
 */
export const ApiChangePassword = () =>
  applyDecorators(
    ApiOperation({
      summary: '비밀번호 변경',
      description: `
현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다.

### 요청
- \`currentPassword\`: 현재 사용 중인 비밀번호
- \`newPassword\`: 변경할 새 비밀번호 (최소 8자, 대소문자 및 숫자 포함)

### 보안 동작
- 비밀번호 변경 후 현재 Access Token이 블랙리스트에 추가됩니다.
- 변경 완료 후 새로 로그인해야 합니다.

### 주의사항
- 현재 비밀번호가 일치해야 변경 가능합니다.
- 변경 후 기존 토큰으로는 API 호출이 불가능합니다.
      `,
    }),
    ApiBody({
      description: '비밀번호 변경 정보',
      type: ChangePasswordRequestDto,
    }),
    ApiResponse({
      status: 200,
      description: '비밀번호 변경 성공',
      type: ChangePasswordResponseDto,
    }),
    ApiResponse({ status: 400, description: '잘못된 요청 (유효성 검증 실패)' }),
    ApiResponse({ status: 401, description: '현재 비밀번호가 일치하지 않음' }),
  );
