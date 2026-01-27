# Rapid Test Analysis Workflow Example

실제 사용 예시를 통한 워크플로우 설명.

## Example 1: 단일 테스트 실패

### 상황

```bash
$ npm test

FAIL  src/business/file/file.service.spec.ts
  ● FileService › uploadFile › should create file record

    expect(received).toEqual(expected)

    Expected: { id: "uuid-123", name: "test.pdf" }
    Received: { id: "uuid-123", name: undefined }

      45 |     const result = await service.uploadFile(mockFile);
      46 |
    > 47 |     expect(result).toEqual({ id: "uuid-123", name: "test.pdf" });
         |                    ^
      48 |   });
```

### Phase 1: 결과 확인

```
✓ 실패 테스트: FileService › uploadFile › should create file record
✓ 실패 유형: Assertion 실패
✓ Expected: name = "test.pdf"
✓ Received: name = undefined
```

### Phase 2: 분류

```
유형: Assertion 실패 (값 불일치)
범위: 단일 테스트
영향: uploadFile 기능
```

### Phase 3: 근본 원인 분석

**Step 1: 에러 위치 확인**
```typescript
// file.service.spec.ts:47
expect(result).toEqual({ id: "uuid-123", name: "test.pdf" });
// result.name이 undefined
```

**Step 2: result 생성 추적**
```typescript
// file.service.spec.ts:45
const result = await service.uploadFile(mockFile);
// uploadFile 함수 확인 필요
```

**Step 3: uploadFile 함수 확인**
```typescript
// file.service.ts
async uploadFile(file: File): Promise<FileRecord> {
  const record = await this.repository.create({
    id: generateUuid(),
    // name: file.name  <- 누락!
  });
  return record;
}
```

**근본 원인 발견:** `name` 필드 할당 누락

### Phase 4: 수정 및 검증

```typescript
// file.service.ts - 수정
async uploadFile(file: File): Promise<FileRecord> {
  const record = await this.repository.create({
    id: generateUuid(),
    name: file.name,  // 추가
  });
  return record;
}
```

```bash
$ npm test

PASS  src/business/file/file.service.spec.ts
  ✓ FileService › uploadFile › should create file record
```

---

## Example 2: 여러 테스트 동시 실패

### 상황

```bash
$ npm test

FAIL  src/business/trash/trash.service.spec.ts
  ● TrashService › restore › should restore file
  ● TrashService › restore › should update parent folder
  ● TrashService › purge › should delete file permanently

FAIL  src/business/file/file.service.spec.ts
  ● FileService › delete › should move to trash
```

### Phase 1: 결과 확인

```
✓ 4개 테스트 실패
✓ 2개 파일에 걸쳐 실패
✓ 모두 delete/trash 관련
```

### Phase 2: 분류 및 패턴 분석

```
패턴 발견:
- 모두 트래시 기능 관련
- 공통 의존성 존재 가능
- TrashRepository 확인 필요
```

### Phase 3: 근본 원인 분석

**Step 1: 공통점 찾기**
```typescript
// 모든 실패 테스트가 TrashRepository 사용
// TrashRepository 상태 확인
```

**Step 2: 첫 번째 실패 상세 확인**
```
Error: Cannot read properties of undefined (reading 'findById')
    at TrashService.restore (trash.service.ts:23:35)
```

**Step 3: TrashRepository 주입 확인**
```typescript
// trash.service.spec.ts - beforeEach
beforeEach(async () => {
  const module = await Test.createTestingModule({
    providers: [
      TrashService,
      // TrashRepository Mock 누락!
    ],
  }).compile();
});
```

**근본 원인 발견:** TrashRepository Mock 설정 누락

### Phase 4: 수정 및 검증

```typescript
// trash.service.spec.ts - 수정
beforeEach(async () => {
  const module = await Test.createTestingModule({
    providers: [
      TrashService,
      {
        provide: TrashRepository,
        useValue: mockTrashRepository,
      },
    ],
  }).compile();
});
```

```bash
$ npm test

PASS  src/business/trash/trash.service.spec.ts
PASS  src/business/file/file.service.spec.ts
```

---

## Example 3: 간헐적 실패 (Flaky Test)

### 상황

```bash
# 첫 번째 실행
$ npm test -- path/to/async.spec.ts
PASS

# 두 번째 실행
$ npm test -- path/to/async.spec.ts
FAIL
```

### Phase 1: 재현 시도

```bash
# 여러 번 실행
$ for i in {1..10}; do npm test -- path/to/async.spec.ts; done

# 결과: 10번 중 3번 실패
```

### Phase 2: 분류

```
유형: 간헐적 실패 (Flaky)
가능성:
- 타이밍 이슈
- 비동기 처리 문제
- 외부 의존성
```

### Phase 3: 근본 원인 분석

**Step 1: 실패 메시지 확인**
```
Error: expect(received).toBe(expected)
Expected: "completed"
Received: "pending"
```

**Step 2: 테스트 코드 확인**
```typescript
test('should complete async operation', async () => {
  service.startAsyncOperation();
  
  await sleep(100);  // 문제: 고정 대기 시간
  
  const status = service.getStatus();
  expect(status).toBe('completed');
});
```

**Step 3: 가설 수립**
```
가설: 100ms가 항상 충분하지 않음
검증: 대기 시간을 늘려서 테스트
```

**Step 4: 검증**
```typescript
// 대기 시간 증가로 검증
await sleep(500);  // → 실패 빈도 감소
```

**근본 원인 확인:** 고정 대기 시간이 불안정

### Phase 4: 올바른 수정

```typescript
// 조건 기반 대기로 변경
test('should complete async operation', async () => {
  service.startAsyncOperation();
  
  // 조건이 충족될 때까지 대기
  await waitFor(() => service.getStatus() === 'completed', {
    timeout: 5000,
    interval: 100,
  });
  
  expect(service.getStatus()).toBe('completed');
});
```

```bash
# 10번 실행 모두 성공
$ for i in {1..10}; do npm test -- path/to/async.spec.ts; done
PASS (10/10)
```

---

## Quick Reference Commands

```bash
# 실패한 테스트만 재실행
npm test -- --onlyFailures

# 단일 테스트 격리 실행
npm test -- --testNamePattern="테스트 이름"

# 상세 로그 출력
npm test -- --verbose

# 디버그 모드
node --inspect-brk node_modules/.bin/jest --runInBand

# 특정 파일만 watch
npm test -- --watch --testPathPattern="file.spec.ts"
```

## Checklist Before Moving On

```
□ 실패 원인을 정확히 파악했는가?
□ 최소한의 수정만 적용했는가?
□ 모든 테스트가 통과하는가?
□ 다른 테스트에 영향이 없는가?
□ 같은 실패가 재발하지 않을 것인가?
```
