# DMS-API 리프레시 토큰 설계

**날짜**: 2025-02-11

## 개요

DMS-API 자체 리프레시 토큰을 도입하여 UX(자동 갱신)와 보안(짧은 액세스 토큰 수명)을 동시에 개선한다.

## 결정 사항

| 항목 | 결정 |
|------|------|
| 목적 | UX 개선 + 보안 강화 |
| 리프레시 토큰 형식 | Opaque (crypto.randomBytes), DB에 SHA-256 해시 저장 |
| 토큰 로테이션 | 사용할 때마다 새 리프레시 토큰 발급, 기존 것은 used 처리 |
| 탈취 감지 | 이미 used된 토큰 재사용 시 해당 family 전체 무효화 |
| 액세스 토큰 만료 | 30분 (내부/외부 동일) |
| 리프레시 토큰 만료 | 내부 14일 / 외부 1일 |
| 엔드포인트 | 기존 `POST /v1/auth/refresh-token` 교체 (SSO 리프레시 제거) |
| generate-token | 리프레시 토큰 미적용 (개발/테스트용) |

## 토큰 흐름

```
[로그인] POST /v1/auth/login
  → SSO 인증 → accessToken(JWT 30분) + refreshToken(opaque) 발급
  → refreshToken 해시를 DB에 저장

[토큰 갱신] POST /v1/auth/refresh-token
  → refreshToken 수신 → DB에서 해시 조회/검증
  → 새 accessToken + 새 refreshToken 발급 (로테이션)
  → 기존 refreshToken은 DB에서 "used" 처리

[로그아웃] POST /v1/auth/logout
  → accessToken 블랙리스트 등록 (기존 유지)
  → 해당 사용자의 활성 refreshToken 전부 무효화

[탈취 감지]
  → 이미 사용된(used) refreshToken으로 갱신 시도
  → 해당 family의 모든 토큰 무효화 → 강제 재로그인
```

## 데이터 모델

**테이블**: `refresh_tokens` (신규)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| token_hash | varchar(64) | SHA-256 해시, UNIQUE |
| user_id | UUID | 사용자 ID |
| user_type | varchar(20) | internal / external |
| family_id | UUID | 로테이션 체인 식별자 |
| is_used | boolean | 사용 여부 (로테이션 감지용) |
| is_revoked | boolean | 강제 무효화 여부 |
| expires_at | timestamptz | 만료 시간 |
| created_at | timestamptz | 생성 시각 |

`family_id`는 로그인 시 생성되어 로테이션 체인 전체를 추적한다.

## 변경 대상

### 신규 생성

| 파일 | 역할 |
|------|------|
| `src/infra/database/entities/refresh-token.orm-entity.ts` | `refresh_tokens` 테이블 ORM 엔티티 |
| `src/business/auth/refresh-token.service.ts` | 리프레시 토큰 생성/검증/로테이션/무효화 |

### 수정 대상

| 파일 | 변경 내용 |
|------|-----------|
| `auth.controller.ts` | login 응답에 refreshToken 추가, refresh-token 엔드포인트 교체, logout에서 family 무효화 |
| `dto/login.dto.ts` | `LoginResponseDto`에 `accessToken`, `refreshToken`, `expiresIn` 추가 |
| `dto/refresh-token.dto.ts` | SSO → DMS 리프레시 토큰 DTO로 변경 |
| `database.module.ts` | `RefreshTokenOrmEntity` 등록 |
| `auth.module.ts` | `RefreshTokenService` 프로바이더 등록 |

### 변경하지 않는 것

- `UnifiedJwtAuthGuard` — 액세스 토큰 검증 그대로 유지
- `TokenBlacklistService` — 액세스 토큰 블랙리스트 그대로 유지
- `generate-token` 엔드포인트 — 리프레시 토큰 미적용

## API 변경 상세

### POST /v1/auth/login 응답

```json
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "opaque-random-string",
  "token": "eyJ...",
  "user": { "id": "...", "employeeNumber": "...", "name": "...", "email": "..." },
  "userType": "internal",
  "expiresIn": 1800
}
```

`token` 필드는 `accessToken`과 동일한 값으로 하위 호환 유지 (deprecated, 향후 제거).

### POST /v1/auth/refresh-token (교체)

Request:
```json
{ "refreshToken": "opaque-token-string" }
```

Response:
```json
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "new-opaque-token",
  "expiresIn": 1800
}
```

### 에러 시나리오

| 상황 | HTTP | 에러 코드 |
|------|------|-----------|
| 리프레시 토큰 만료 | 401 | `REFRESH_TOKEN_EXPIRED` |
| 리프레시 토큰 무효 | 401 | `INVALID_REFRESH_TOKEN` |
| 이미 사용된 토큰 (탈취 의심) | 401 | `TOKEN_REUSE_DETECTED` (family 전체 무효화) |
| 토큰 revoked | 401 | `TOKEN_REVOKED` |

## RefreshTokenService 핵심 메서드

```typescript
class RefreshTokenService {
  createRefreshToken(userId, userType): Promise<{ token, familyId }>
  rotateRefreshToken(oldToken): Promise<{ accessToken, refreshToken }>
  revokeFamily(familyId): Promise<void>
  revokeAllForUser(userId): Promise<void>
  cleanupExpired(): Promise<void>  // Cron 배치 정리
}
```

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ACCESS_TOKEN_EXPIRES_IN` | `1800` | 액세스 토큰 만료 (초) |
| `REFRESH_TOKEN_EXPIRES_IN` | `1209600` | 내부 리프레시 토큰 만료 (14일, 초) |
| `EXTERNAL_REFRESH_TOKEN_EXPIRES_IN` | `86400` | 외부 리프레시 토큰 만료 (1일, 초) |
