# Test Failure Patterns

테스트 실패 시 빠른 원인 파악을 위한 패턴 가이드.

## Assertion Failures

### 값 불일치

```
Error: expect(received).toBe(expected)
Expected: "success"
Received: undefined
```

**분석 순서:**
1. `undefined`가 나온 위치 확인
2. 해당 값을 생성하는 함수 추적
3. 함수 입력값 확인
4. 함수 내부 로직 확인

**흔한 원인:**
- 함수가 return 없음
- 비동기 함수에서 await 누락
- 조건문에서 특정 케이스 누락

### 타입 불일치

```
Error: expect(received).toEqual(expected)
Expected: { id: 1, name: "test" }
Received: { id: "1", name: "test" }
```

**분석 순서:**
1. 데이터 원본 확인 (DB, API 응답 등)
2. 변환 과정 추적
3. 타입 변환 지점 확인

**흔한 원인:**
- DB에서 string으로 반환
- JSON.parse 타입 문제
- 타입 캐스팅 누락

### 배열 길이 불일치

```
Error: expect(received).toHaveLength(expected)
Expected: 3
Received: 0
```

**분석 순서:**
1. 배열 생성 로직 확인
2. 필터/맵 조건 확인
3. 데이터 소스 상태 확인

**흔한 원인:**
- 필터 조건 너무 엄격
- 데이터 로드 전 접근
- Mock 데이터 누락

## Runtime Errors

### TypeError: Cannot read property 'x' of undefined

```
TypeError: Cannot read properties of undefined (reading 'id')
    at FileService.getFile (file.service.ts:45:23)
```

**분석 순서:**
1. 스택트레이스의 파일:라인 번호로 이동
2. 해당 라인에서 `.` 접근하는 객체 확인
3. 그 객체가 왜 undefined인지 추적
4. 객체를 생성하는 코드로 이동하여 확인

**흔한 원인:**
- DB 조회 결과 없음
- 비동기 데이터 대기 누락
- 옵셔널 체이닝 누락

### ReferenceError: X is not defined

```
ReferenceError: myFunction is not defined
    at Object.<anonymous> (test.spec.ts:10:3)
```

**분석 순서:**
1. import 문 확인
2. 함수/변수 이름 스펠링 확인
3. export 여부 확인

**흔한 원인:**
- import 누락
- 오타
- 순환 의존성

## Async/Await Issues

### Promise Rejection

```
Error: Unhandled Promise Rejection
    at async FileService.uploadFile
```

**분석 순서:**
1. async 함수 내부 확인
2. try-catch 블록 확인
3. Promise 체인 확인

**흔한 원인:**
- 에러 핸들링 누락
- await 누락
- Promise.all에서 하나가 실패

### Timeout

```
Timeout - Async callback was not invoked within 5000ms
```

**분석 순서:**
1. 테스트 내 async/await 확인
2. Mock이 resolve되는지 확인
3. 무한 루프 가능성 확인

**흔한 원인:**
- await 누락
- Mock이 Promise를 resolve 안함
- done() 콜백 호출 안함

## Mock-Related Failures

### Mock 호출 횟수 불일치

```
expect(jest.fn()).toHaveBeenCalledTimes(expected)
Expected: 1
Received: 0
```

**분석 순서:**
1. Mock이 올바른 위치에 설정됐는지 확인
2. 실제 함수가 호출되는 경로 확인
3. Mock이 제대로 주입됐는지 확인

**흔한 원인:**
- Mock 위치 잘못됨
- 모듈 import 순서 문제
- 의존성 주입 누락

### Mock 반환값 문제

```
TypeError: mockFunction(...).then is not a function
```

**분석 순서:**
1. Mock 반환값 타입 확인
2. 실제 함수의 반환 타입 확인
3. mockResolvedValue vs mockReturnValue 확인

**흔한 원인:**
- 비동기 함수를 동기 Mock으로 설정
- mockReturnValue 대신 mockResolvedValue 필요
- Mock 반환 구조 불일치

## Test Isolation Failures

### 순서 의존적 실패

```
Running tests individually: PASS
Running all tests: FAIL
```

**분석 순서:**
1. 테스트 간 공유 상태 확인
2. beforeEach/afterEach 리셋 확인
3. 모듈 레벨 변수 확인

**흔한 원인:**
- 전역 상태 오염
- Mock 리셋 안됨
- 싱글톤 상태 유지

### Polluter 찾기

```bash
# 실패하는 테스트 격리 실행
npm test -- --runInBand --testPathPattern="failing.spec.ts"

# 다른 테스트와 함께 실행
npm test -- --runInBand --testPathPattern="(suspect|failing).spec.ts"
```

**흔한 원인:**
- 이전 테스트가 DB 상태 변경
- Mock이 restore되지 않음
- 환경 변수 수정됨

## Database-Related Failures

### 데이터 조회 실패

```
Error: expect(received).toEqual(expected)
Expected: { id: 1, name: "test" }
Received: null
```

**분석 순서:**
1. 테스트 데이터 설정 확인
2. 트랜잭션 롤백 확인
3. 쿼리 조건 확인

**흔한 원인:**
- 테스트 데이터 미설정
- 이전 테스트가 데이터 삭제
- 쿼리 조건 불일치

## Quick Diagnosis Flow

```
테스트 실패
    │
    ├─ Assertion 실패?
    │   └─ Expected vs Received 비교 → 값 추적
    │
    ├─ TypeError?
    │   └─ 스택트레이스 따라 undefined 찾기
    │
    ├─ Timeout?
    │   └─ async/await, Mock resolve 확인
    │
    ├─ 다른 테스트와 함께만 실패?
    │   └─ 테스트 격리 문제 → Polluter 찾기
    │
    └─ Mock 관련?
        └─ Mock 설정, 반환값, 호출 확인
```
