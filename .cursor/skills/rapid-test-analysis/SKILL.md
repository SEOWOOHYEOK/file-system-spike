---
name: rapid-test-analysis
description: Run tests quickly, analyze failures systematically, and debug using TDD + systematic-debugging principles
---

# Rapid Test Analysis

## Overview

빠르게 테스트를 실행하고, 결과를 분석하며, 실패 원인을 체계적으로 파악하는 통합 워크플로우.

**Core principle:** 테스트 실행 → 결과 분석 → 근본 원인 파악을 하나의 흐름으로 처리한다.

## When to Use

- 테스트 실행 후 결과를 빠르게 분석해야 할 때
- 여러 테스트가 실패하여 원인을 파악해야 할 때
- TDD 사이클에서 RED/GREEN 검증이 필요할 때
- CI/CD 파이프라인 실패를 분석할 때
- 기존 테스트가 갑자기 실패하기 시작할 때

## The Iron Law

```
테스트 결과 없이 추측하지 마라
실패 메시지를 완전히 읽지 않고 수정하지 마라
```

## Phase 1: Test Execution (빠른 테스트 실행)

### 1.1 전체 테스트 실행

```bash
# 전체 테스트
npm test

# 특정 파일만
npm test -- path/to/file.spec.ts

# 특정 테스트만
npm test -- --testNamePattern="test name"

# Watch 모드 (개발 중)
npm test -- --watch
```

### 1.2 실행 결과 캡처

테스트 실행 시 다음 정보를 반드시 확인:
- **총 테스트 수**: 전체/통과/실패/스킵
- **실패한 테스트 목록**: 정확한 테스트 이름
- **에러 메시지**: 전체 스택 트레이스 포함
- **실행 시간**: 비정상적으로 오래 걸린 테스트

## Phase 2: Result Classification (결과 분류)

### 2.1 실패 유형 분류

| 유형 | 특징 | 다음 단계 |
|------|------|----------|
| **Assertion 실패** | `expect(...).toBe(...)` 실패 | Phase 3로 진행 |
| **에러/예외** | `TypeError`, `ReferenceError` 등 | 코드 에러 확인 |
| **타임아웃** | 테스트가 완료되지 않음 | 비동기 처리 확인 |
| **설정 실패** | `beforeEach`, 모듈 로드 실패 | 테스트 환경 확인 |

### 2.2 실패 패턴 분석

```
단일 테스트 실패:
  → 해당 기능 또는 테스트 자체 문제
  → Phase 3으로 진행

여러 테스트 동시 실패:
  → 공통 의존성 확인
  → 공유 상태 오염 가능성
  → Phase 3에서 공통점 분석

모든 테스트 실패:
  → 환경 설정 문제
  → 테스트 프레임워크 설정 확인
```

## Phase 3: Root Cause Analysis (근본 원인 분석)

**systematic-debugging 스킬의 원칙을 적용:**

### 3.1 에러 메시지 완전히 읽기

```
❌ 잘못된 접근:
   "음, undefined가 나왔네, null 체크 추가해야겠다"

✅ 올바른 접근:
   1. 에러 메시지 전체를 읽는다
   2. 스택 트레이스의 파일과 라인 번호를 확인한다
   3. expected vs received 값을 정확히 파악한다
   4. 왜 그 값이 나왔는지 추론한다
```

### 3.2 데이터 흐름 추적

**실패한 assertion에서 역방향 추적:**

```
Assertion 실패 지점
    ↑
테스트에서 호출한 함수
    ↑
그 함수가 의존하는 데이터
    ↑
데이터의 원본 소스
    ↑
근본 원인 발견
```

### 3.3 가설 수립 및 검증

```typescript
// 가설: "X 함수가 null을 반환하고 있다"

// 검증 방법 1: 로그 추가
console.log('DEBUG: X result =', result);

// 검증 방법 2: 단위 테스트로 확인
test('X returns expected value', () => {
  const result = X(testInput);
  expect(result).toBeDefined();
});

// 검증 방법 3: 디버거 사용
// --inspect-brk 옵션으로 디버깅
```

## Phase 4: TDD Cycle Integration (TDD 사이클 통합)

### 4.1 RED 단계 검증

테스트가 실패했을 때:

```
체크리스트:
□ 테스트가 올바른 이유로 실패하는가?
  - 기능이 없어서 실패 ✓
  - 타이포/문법 에러로 실패 ✗
  
□ 에러 메시지가 기대한 것인가?
  - "expected X but got undefined" ✓
  - "Cannot read property 'x' of undefined" ✗

□ 실패 메시지가 구현해야 할 내용을 알려주는가?
```

### 4.2 GREEN 단계 검증

코드 수정 후:

```
체크리스트:
□ 수정한 테스트가 통과하는가?
□ 다른 테스트들도 여전히 통과하는가?
□ 경고나 에러 메시지 없이 깨끗하게 통과하는가?
□ 최소한의 코드만 작성했는가?
```

### 4.3 실패 원인별 대응

| 실패 원인 | TDD 대응 |
|----------|---------|
| 기능 미구현 | 정상 - GREEN으로 진행 |
| 테스트 자체 오류 | 테스트 수정 필요 |
| 기존 기능 회귀 | 원인 파악 후 수정 |
| 설계 문제 | REFACTOR 필요 |

## Phase 5: Debugging Workflow (디버깅 워크플로우)

### 5.1 단계별 접근

```
Step 1: 재현
  - 실패하는 테스트를 단독으로 실행
  - 일관되게 실패하는지 확인
  - 실패 조건 기록

Step 2: 격리
  - 관련 없는 테스트 제외
  - 최소 재현 케이스 만들기
  - 외부 의존성 제거 시도

Step 3: 분석
  - 에러 메시지 완전히 읽기
  - 스택 트레이스 따라가기
  - 변수 값 확인

Step 4: 가설
  - "X 때문에 Y가 발생한다"
  - 한 번에 하나의 가설만
  - 검증 가능한 형태로 작성

Step 5: 검증
  - 가설을 테스트하는 최소 변경
  - 결과 확인
  - 맞으면 수정, 틀리면 새 가설
```

### 5.2 흔한 실패 원인 체크리스트

```
□ 비동기 처리
  - await 누락
  - Promise 체인 문제
  - 타이밍 이슈

□ Mock/Stub 문제
  - Mock이 실제 동작과 다름
  - Mock 리셋 안됨
  - 잘못된 반환값

□ 테스트 격리 실패
  - 공유 상태 오염
  - 테스트 순서 의존성
  - beforeEach/afterEach 문제

□ 환경 문제
  - 환경 변수 미설정
  - 파일 경로 문제
  - 플랫폼 차이

□ 타입/데이터 문제
  - null/undefined 처리
  - 타입 불일치
  - 빈 배열/객체 처리
```

## Quick Commands Reference

```bash
# 전체 테스트 실행
npm test

# 특정 파일 테스트
npm test -- src/path/to/file.spec.ts

# 특정 테스트명 패턴
npm test -- --testNamePattern="should return"

# 실패한 테스트만 재실행
npm test -- --onlyFailures

# 커버리지 포함
npm test -- --coverage

# 상세 출력
npm test -- --verbose

# Watch 모드
npm test -- --watch

# 디버그 모드
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Analysis Template

테스트 실패 분석 시 다음 템플릿 사용:

```markdown
## 테스트 실패 분석

### 실패한 테스트
- 파일: [파일 경로]
- 테스트명: [테스트 이름]

### 에러 메시지
[전체 에러 메시지 복사]

### Expected vs Received
- Expected: [기대값]
- Received: [실제값]

### 근본 원인 가설
1. [가설 1]
2. [가설 2]

### 검증 결과
- 가설 1: [결과]
- 가설 2: [결과]

### 해결 방안
[구체적인 수정 내용]

### 적용 후 결과
[테스트 재실행 결과]
```

## Red Flags - STOP

다음 상황에서는 멈추고 프로세스를 따라라:

- "이거 그냥 X 수정하면 될 것 같아" → 근거 없는 추측
- 에러 메시지 읽지 않고 수정 시도
- 여러 곳을 동시에 수정
- "아까는 됐는데..." → 재현 불가능
- 3번 이상 수정 시도 후에도 실패 → 아키텍처 재검토

## Integration with Other Skills

이 스킬은 다음 스킬들과 함께 사용:

- **test-driven-development**: RED-GREEN-REFACTOR 사이클
- **systematic-debugging**: 4단계 디버깅 프로세스
- **root-cause-tracing.md**: 데이터 흐름 역추적

## Final Checklist

작업 완료 전 확인:

- [ ] 모든 테스트가 통과하는가?
- [ ] 실패 원인을 정확히 파악했는가?
- [ ] 최소한의 수정만 적용했는가?
- [ ] 다른 테스트에 영향이 없는가?
- [ ] 동일한 실패가 재발하지 않을 것인가?
