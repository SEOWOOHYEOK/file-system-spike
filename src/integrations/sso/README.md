# SSO 통합 모듈

Lumir Company SSO SDK를 NestJS에서 사용하기 위한 통합 모듈입니다.

## 환경 변수 설정

`.env` 파일에 다음 환경 변수를 추가해주세요:

```bash
SSO_BASE_URL=https://lsso.vercel.app
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret
```

### 서버 환경별 URL

```bash
# 개발 서버
SSO_BASE_URL=https://lsso-git-dev-lumir-tech7s-projects.vercel.app

# 실서버
SSO_BASE_URL=https://lsso.vercel.app
```

## 사용 방법

### 1. 기본 사용

컨트롤러나 서비스에서 `SSOService`를 주입받아 사용합니다:

```typescript
import { Injectable } from '@nestjs/common';
import { SSOService } from '../integrations/sso';

@Injectable()
export class AuthService {
    constructor(private readonly ssoService: SSOService) {}

    async login(email: string, password: string) {
        const result = await this.ssoService.login(email, password);
        return {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            user: {
                id: result.id,
                name: result.name,
                email: result.email,
                employeeNumber: result.employeeNumber,
            },
        };
    }

    async verifyToken(token: string) {
        return await this.ssoService.verifyToken(token);
    }
}
```

### 2. 로그인 & 인증

```typescript
// 로그인
const loginResult = await this.ssoService.login('user@example.com', 'password123');
console.log('Access Token:', loginResult.accessToken);
console.log('사용자:', loginResult.name);

// 토큰 검증
const verifyResult = await this.ssoService.verifyToken(accessToken);
console.log('토큰 유효:', verifyResult.valid);

// 토큰 갱신
const refreshResult = await this.ssoService.refreshToken(refreshToken);
console.log('새 Access Token:', refreshResult.accessToken);

// 비밀번호 확인
const isValid = await this.ssoService.checkPassword(
    accessToken,
    'currentPassword',
    'user@example.com'
);

// 비밀번호 변경
await this.ssoService.changePassword(accessToken, 'newPassword456');
```

### 3. 조직 정보 조회

```typescript
// 직원 정보 조회 (사번 또는 ID로)
const employee = await this.ssoService.getEmployee({
    employeeNumber: 'E2023001',
    withDetail: true, // 부서, 직책, 직급 포함
});

// 여러 직원 정보 조회
const employees = await this.ssoService.getEmployees({
    identifiers: ['E2023001', 'E2023002'], // 생략 시 전체 조회
    withDetail: true,
    includeTerminated: false, // 퇴사자 제외
});

// 부서 계층구조 조회
const hierarchy = await this.ssoService.getDepartmentHierarchy({
    rootDepartmentId: 'dept-123', // 특정 부서부터 시작 (생략 시 전체)
    maxDepth: 3, // 최대 깊이
    withEmployeeDetail: true, // 직원 상세 정보 포함
    includeEmptyDepartments: true, // 빈 부서 포함
});

// 직원들의 매니저 정보 조회
const managers = await this.ssoService.getEmployeesManagers();
```

### 4. FCM 토큰 관리

```typescript
// FCM 토큰 구독 (앱 로그인 시)
const subscribeResult = await this.ssoService.subscribeFcm({
    employeeNumber: 'E2023001',
    fcmToken: 'device-fcm-token-from-firebase',
    deviceType: 'android', // 'android', 'ios', 'pc', 'web'
});

// FCM 토큰 조회
const tokenInfo = await this.ssoService.getFcmToken({
    employeeNumber: 'E2023001',
});
console.log('토큰 개수:', tokenInfo.tokens.length);

// 여러 직원의 FCM 토큰 조회 (알림서버용)
const multipleTokens = await this.ssoService.getMultipleFcmTokens({
    employeeNumbers: ['E2023001', 'E2023002', 'E2023003'],
});
console.log(`총 ${multipleTokens.totalEmployees}명, ${multipleTokens.totalTokens}개 토큰`);

// FCM 토큰 구독 해지 (앱 로그아웃 시)
await this.ssoService.unsubscribeFcm({
    employeeNumber: 'E2023001',
});
```

## 에러 핸들링

```typescript
import { 
    ApiError, 
    AuthenticationError, 
    AuthorizationError,
    ValidationError,
    NotFoundError 
} from '@lumir-company/sso-sdk';

try {
    const result = await this.ssoService.login('user@example.com', 'wrongpassword');
} catch (error) {
    if (error instanceof AuthenticationError) {
        // 인증 실패 (401)
        throw new UnauthorizedException('인증에 실패했습니다.');
    } else if (error instanceof AuthorizationError) {
        // 권한 없음 (403)
        throw new ForbiddenException('권한이 없습니다.');
    } else if (error instanceof ValidationError) {
        // 유효성 검증 실패 (400)
        throw new BadRequestException('입력 데이터가 올바르지 않습니다.');
    } else if (error instanceof NotFoundError) {
        // 리소스 없음 (404)
        throw new NotFoundException('요청한 리소스를 찾을 수 없습니다.');
    }
}
```

## 직접 SSOClient 사용하기

필요한 경우 `SSOClient`를 직접 주입받아 사용할 수도 있습니다:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { SSOClient } from '@lumir-company/sso-sdk';
import { SSO_CLIENT } from '../integrations/sso';

@Injectable()
export class CustomService {
    constructor(@Inject(SSO_CLIENT) private readonly ssoClient: SSOClient) {}

    async customMethod() {
        // SSOClient의 모든 기능에 직접 접근 가능
        const result = await this.ssoClient.sso.login('user@example.com', 'password');
        return result;
    }
}
```

## 주요 기능

- ✅ **인증 & 로그인**: 이메일/비밀번호 로그인, 토큰 검증, 토큰 갱신
- ✅ **비밀번호 관리**: 비밀번호 확인 및 변경
- ✅ **조직 정보**: 직원 정보, 부서 계층구조, 매니저 정보 조회
- ✅ **FCM 토큰**: 푸시 알림을 위한 FCM 토큰 관리
- ✅ **자동 재시도**: 네트워크 오류 시 자동 재시도
- ✅ **에러 핸들링**: 표준화된 에러 타입
- ✅ **로깅**: 개발 환경에서 자동 로깅 활성화

## 참고

- 공식 SDK 문서: `node_modules/@lumir-company/sso-sdk/README.md`
- SDK 타입 정의: `node_modules/@lumir-company/sso-sdk/dist/index.d.ts`
