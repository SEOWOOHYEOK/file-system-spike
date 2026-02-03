---
name: scenario-test-generator
description: 코드 전반의 구성 요소(Controller, Service, Domain)를 분석하여 E2E 시나리오 테스트 문서를 생성한다. 사용자가 시나리오 테스트, API 테스트 문서, 통합 테스트 계획, 또는 엔드포인트 플로우 분석을 요청할 때 사용한다.
---

# Scenario Test Generator

## Overview

코드베이스의 구성 요소를 체계적으로 분석하여 E2E 시나리오 테스트 문서를 생성하는 스킬.

**핵심 원칙:** 코드 분석 → 의존성 파악 → 시나리오 도출 → 문서 생성

## When to Use

- API 엔드포인트의 E2E 시나리오가 필요할 때
- 새 기능의 통합 테스트 계획을 세울 때
- 기존 기능의 엣지케이스와 에러 시나리오를 파악할 때
- 코드 리뷰 시 테스트 커버리지를 점검할 때

## Phase 1: Component Discovery (컴포넌트 탐색)

### 1.1 대상 범위 확인

사용자가 특정 기능/모듈을 지정했는지 확인:

```
특정 기능 지정됨:
  → 해당 Controller부터 분석 시작
  → 예: "파일 업로드" → FileController.upload()

범위 미지정:
  → 전체 Controller 목록 제시
  → 사용자에게 분석 대상 선택 요청
```

### 1.2 Controller 분석

```
분석 순서:
1. Controller 파일 읽기 (src/interface/controller/)
2. 각 엔드포인트 메서드 식별
3. HTTP Method, Path, Parameters 추출
4. 의존하는 Service 파악
```

**추출할 정보:**

| 항목 | 예시 |
|------|------|
| HTTP Method | POST, GET, PUT, DELETE |
| Path | /v1/files/upload |
| Path Params | :fileId |
| Body Params | folderId, conflictStrategy |
| Query Params | limit, offset |
| 의존 서비스 | FileUploadService |

### 1.3 Service 분석

```
분석 순서:
1. Service 파일 읽기 (src/business/)
2. 메서드 시그니처와 반환 타입 확인
3. 의존하는 Repository/외부 서비스 파악
4. 예외 발생 조건 식별
```

### 1.4 Domain 분석

```
분석 순서:
1. DTO/Entity 파일 읽기 (src/domain/)
2. 필수 필드 vs 선택 필드 구분
3. 유효성 검증 규칙 확인
4. Enum 값들 파악
```

## Phase 2: Flow Mapping (플로우 매핑)

### 2.1 요청 흐름 추적

```
Controller → Service → Repository → 외부 시스템

예시:
POST /v1/files/upload
  ↓
FileController.upload()
  ↓
FileUploadService.upload()
  ↓
FileRepository.save()
  ↓
NAS Storage (Queue)
```

### 2.2 의존성 맵 생성

각 엔드포인트에 대해 다음 정보 수집:

```typescript
// 의존성 맵 예시
{
  endpoint: "POST /v1/files/upload",
  controller: "FileController.upload()",
  services: ["FileUploadService"],
  repositories: ["FileRepository"],
  external: ["NAS via Queue"],
  events: ["FileSyncEvent 발행"]
}
```

## Phase 3: Scenario Derivation (시나리오 도출)

### 3.1 Happy Path 시나리오

정상적인 플로우를 먼저 도출:

```markdown
## 정상 시나리오

### SC-001: 단일 파일 업로드 성공
- 전제조건: 유효한 인증 토큰, 존재하는 폴더 ID
- 요청: POST /v1/files/upload (file, folderId)
- 기대결과: 201 Created, 파일 메타데이터 반환
- 후속동작: NAS 동기화 큐에 이벤트 등록
```

### 3.2 Edge Case 시나리오

경계 조건과 특수 케이스:

```markdown
## 엣지케이스 시나리오

### SC-010: 대용량 파일 업로드 (100MB 초과)
### SC-011: 파일명 특수문자 포함
### SC-012: 동일 파일명 존재 시 충돌 전략
### SC-013: 빈 파일 업로드
### SC-014: 파일 확장자 없음
```

### 3.3 Error 시나리오

예외와 에러 상황:

```markdown
## 에러 시나리오

### SC-050: 인증 실패 (401)
### SC-051: 폴더 미존재 (404)
### SC-052: 권한 없음 (403)
### SC-053: 용량 초과 (413)
### SC-054: 잘못된 파일 형식 (400)
### SC-055: 서버 내부 오류 (500)
```

### 3.4 시나리오 도출 체크리스트

각 엔드포인트에 대해 다음 질문:

```
□ 필수 파라미터가 누락되면?
□ 파라미터 타입이 잘못되면?
□ 파라미터 값이 유효 범위를 벗어나면?
□ 참조하는 리소스가 없으면?
□ 참조하는 리소스에 권한이 없으면?
□ 동시에 같은 요청이 들어오면?
□ 외부 시스템(NAS/Queue)이 응답하지 않으면?
□ 트랜잭션 중간에 실패하면?
```

## Phase 4: Document Generation (문서 생성)

### 4.1 출력 위치

```
docs/scenarios/{feature-name}/
├── README.md           # 기능 개요
├── happy-path.md       # 정상 시나리오
├── edge-cases.md       # 엣지케이스
└── error-scenarios.md  # 에러 시나리오
```

### 4.2 시나리오 문서 템플릿

```markdown
# {Feature Name} 시나리오 테스트

## 개요
- 대상 API: {엔드포인트 목록}
- 관련 서비스: {서비스 목록}
- 작성일: {날짜}

---

## 시나리오 목록

| ID | 분류 | 시나리오명 | 우선순위 |
|----|------|----------|---------|
| SC-001 | Happy | 단일 파일 업로드 성공 | P0 |
| SC-010 | Edge | 대용량 파일 처리 | P1 |
| SC-050 | Error | 인증 실패 | P0 |

---

## 상세 시나리오

### SC-001: 단일 파일 업로드 성공

**분류:** Happy Path  
**우선순위:** P0 (필수)

**전제조건:**
- 유효한 JWT 인증 토큰
- 대상 폴더가 존재함
- 사용자가 해당 폴더에 쓰기 권한 있음

**테스트 데이터:**
```json
{
  "file": "test.pdf (10KB)",
  "folderId": "folder-uuid-123"
}
```

**요청:**
```http
POST /v1/files/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [binary]
folderId: folder-uuid-123
```

**기대 응답:**
```json
{
  "id": "file-uuid-456",
  "name": "test.pdf",
  "sizeBytes": 10240,
  "mimeType": "application/pdf",
  "folderId": "folder-uuid-123",
  "state": "SYNCING",
  "syncEventId": "event-uuid-789"
}
```

**검증 포인트:**
- [ ] HTTP 상태 코드 201 반환
- [ ] 파일 ID가 UUID 형식
- [ ] state가 "SYNCING"
- [ ] syncEventId 존재
- [ ] DB에 파일 레코드 생성됨
- [ ] 동기화 큐에 이벤트 등록됨

**후속 검증 (비동기):**
- [ ] 일정 시간 후 state가 "ACTIVE"로 변경
- [ ] NAS에 파일이 실제로 저장됨

---
```

### 4.3 시나리오 ID 규칙

```
SC-{범위}{번호}

범위:
  0xx: Happy Path
  1xx-4xx: Edge Cases
  5xx-8xx: Error Scenarios
  9xx: 성능/부하 테스트

예시:
  SC-001: 기본 성공 케이스
  SC-101: 경계값 테스트
  SC-501: 4xx 에러
  SC-551: 5xx 에러
  SC-901: 동시성 테스트
```

## Phase 5: Validation (검증)

### 5.1 문서 완성도 체크

```
□ 모든 엔드포인트가 커버되었는가?
□ 각 엔드포인트에 Happy/Edge/Error가 있는가?
□ 전제조건이 명확한가?
□ 테스트 데이터가 구체적인가?
□ 검증 포인트가 측정 가능한가?
□ 비동기 동작이 있다면 후속 검증이 있는가?
```

### 5.2 누락 시나리오 점검

코드의 다음 요소를 재확인:

```
□ Guard/Interceptor의 검증 로직
□ DTO의 @IsNotEmpty, @IsUUID 등 validation
□ Service의 throw 문
□ Repository의 .findOneOrFail() 등
□ Domain Entity의 비즈니스 규칙
```

## Quick Start Workflow

```
1. 분석 대상 확인
   "어떤 기능/API의 시나리오를 만들까요?"

2. 컴포넌트 탐색
   Controller → Service → Domain 순으로 읽기

3. 플로우 매핑
   요청-응답 흐름과 의존성 정리

4. 시나리오 도출
   Happy → Edge → Error 순서로 작성

5. 문서 생성
   템플릿에 맞춰 docs/scenarios/ 에 저장

6. 검증
   완성도 체크리스트 확인
```

## Integration with Existing Skills

- **rapid-test-analysis**: 생성된 시나리오 실행 및 결과 분석
- **systematic-debugging**: 시나리오 실패 시 원인 추적
- **test-driven-development**: 시나리오를 기반으로 테스트 코드 작성

## Output Example

최종 출력물 예시: [examples.md](examples.md)
