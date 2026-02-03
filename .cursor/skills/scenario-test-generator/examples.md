# Scenario Test Generator 예제

## 예제 1: 파일 관리 API 시나리오

### 분석 대상

```
Controller: FileController (src/interface/controller/file/file.controller.ts)
Services: FileUploadService, FileDownloadService, FileManageService
Domain: File Entity, DTOs
```

### 의존성 맵

```
FileController
├── FileUploadService
│   ├── FileRepository
│   ├── FolderRepository (폴더 존재 확인)
│   └── SyncEventQueue (NAS 동기화)
├── FileDownloadService
│   ├── FileRepository
│   └── NasStorageService (파일 스트림)
└── FileManageService
    ├── FileRepository
    └── TrashService (삭제 시)
```

---

## 생성된 시나리오 문서

### 파일 업로드 시나리오

| ID | 분류 | 시나리오명 | 우선순위 |
|----|------|----------|---------|
| SC-001 | Happy | 단일 파일 업로드 성공 | P0 |
| SC-002 | Happy | 다중 파일 업로드 성공 | P0 |
| SC-010 | Edge | 100MB 이상 대용량 파일 | P1 |
| SC-011 | Edge | 한글/특수문자 파일명 | P1 |
| SC-012 | Edge | 동일 파일명 - OVERWRITE 전략 | P1 |
| SC-013 | Edge | 동일 파일명 - RENAME 전략 | P1 |
| SC-014 | Edge | 동일 파일명 - FAIL 전략 | P1 |
| SC-015 | Edge | 확장자 없는 파일 | P2 |
| SC-050 | Error | 인증 토큰 누락 (401) | P0 |
| SC-051 | Error | 폴더 ID 미존재 (404) | P0 |
| SC-052 | Error | 폴더 쓰기 권한 없음 (403) | P1 |
| SC-053 | Error | 파일 크기 제한 초과 (413) | P1 |
| SC-054 | Error | 허용되지 않은 MIME 타입 (400) | P2 |
| SC-055 | Error | NAS 연결 실패 시 처리 | P1 |

---

### SC-001: 단일 파일 업로드 성공

**분류:** Happy Path  
**우선순위:** P0 (필수)

**전제조건:**
- 유효한 JWT 인증 토큰
- folderId에 해당하는 폴더 존재
- 사용자가 해당 폴더에 FILE_WRITE 권한 보유
- 파일 크기 100MB 미만

**테스트 데이터:**
```json
{
  "file": {
    "name": "report.pdf",
    "size": 102400,
    "mimeType": "application/pdf"
  },
  "folderId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**요청:**
```http
POST /v1/files/upload HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="report.pdf"
Content-Type: application/pdf

[Binary content]
------WebKitFormBoundary
Content-Disposition: form-data; name="folderId"

550e8400-e29b-41d4-a716-446655440000
------WebKitFormBoundary--
```

**기대 응답:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "report.pdf",
  "originalName": "report.pdf",
  "sizeBytes": 102400,
  "mimeType": "application/pdf",
  "folderId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "SYNCING",
  "syncEventId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "createdAt": "2026-01-28T10:00:00.000Z",
  "createdBy": "user-uuid"
}
```

**검증 포인트:**

동기 검증:
- [ ] HTTP 상태 코드가 201 Created
- [ ] 응답 body에 id 필드 존재 (UUID 형식)
- [ ] name이 원본 파일명과 일치
- [ ] sizeBytes가 실제 파일 크기와 일치
- [ ] mimeType이 파일 타입과 일치
- [ ] state가 "SYNCING"
- [ ] syncEventId가 UUID 형식으로 존재

DB 검증:
- [ ] files 테이블에 레코드 생성됨
- [ ] sync_events 테이블에 이벤트 등록됨
- [ ] 이벤트 상태가 "PENDING"

비동기 검증 (후속):
- [ ] 10초 이내 sync_events 상태가 "COMPLETED"로 변경
- [ ] files 레코드의 state가 "ACTIVE"로 변경
- [ ] NAS 경로에 파일이 실제로 존재

---

### SC-012: 동일 파일명 - OVERWRITE 전략

**분류:** Edge Case  
**우선순위:** P1

**전제조건:**
- SC-001의 전제조건 모두 충족
- 동일 폴더에 같은 이름의 파일이 이미 존재
- conflictStrategy = "OVERWRITE" 지정

**테스트 데이터:**
```json
{
  "existingFile": {
    "id": "existing-file-uuid",
    "name": "report.pdf",
    "version": 1
  },
  "newFile": {
    "name": "report.pdf",
    "size": 204800
  },
  "folderId": "550e8400-e29b-41d4-a716-446655440000",
  "conflictStrategy": "OVERWRITE"
}
```

**요청:**
```http
POST /v1/files/upload HTTP/1.1
Content-Type: multipart/form-data

file: [new report.pdf]
folderId: 550e8400-e29b-41d4-a716-446655440000
conflictStrategy: OVERWRITE
```

**기대 동작:**
1. 기존 파일을 휴지통으로 이동 (soft delete)
2. 새 파일을 동일한 이름으로 생성
3. 버전 히스토리 유지 (선택적)

**기대 응답:**
```json
{
  "id": "new-file-uuid",
  "name": "report.pdf",
  "previousVersionId": "existing-file-uuid",
  "state": "SYNCING"
}
```

**검증 포인트:**
- [ ] 기존 파일의 state가 "TRASHED"로 변경
- [ ] 새 파일 ID가 기존과 다름
- [ ] 파일명은 동일
- [ ] previousVersionId로 기존 파일 참조 가능

---

### SC-051: 폴더 ID 미존재 (404)

**분류:** Error Scenario  
**우선순위:** P0 (필수)

**전제조건:**
- 유효한 JWT 인증 토큰
- folderId가 존재하지 않는 UUID

**테스트 데이터:**
```json
{
  "file": "test.pdf",
  "folderId": "00000000-0000-0000-0000-000000000000"
}
```

**요청:**
```http
POST /v1/files/upload HTTP/1.1
Authorization: Bearer {valid-token}

file: [binary]
folderId: 00000000-0000-0000-0000-000000000000
```

**기대 응답:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "statusCode": 404,
  "message": "Folder not found",
  "error": "Not Found",
  "code": "FOLDER_NOT_FOUND",
  "details": {
    "folderId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**검증 포인트:**
- [ ] HTTP 상태 코드가 404
- [ ] error code가 "FOLDER_NOT_FOUND"
- [ ] 파일이 DB에 저장되지 않음
- [ ] 동기화 이벤트가 생성되지 않음

---

## 예제 2: 휴지통 복원 시나리오

### 분석 대상

```
Controller: TrashController (src/interface/controller/trash/)
Services: TrashService
Worker: TrashRestoreWorker
```

### 도출된 시나리오

| ID | 분류 | 시나리오명 | 우선순위 |
|----|------|----------|---------|
| SC-001 | Happy | 단일 파일 복원 성공 | P0 |
| SC-002 | Happy | 폴더 및 하위 항목 복원 | P0 |
| SC-010 | Edge | 원래 위치가 삭제된 경우 | P1 |
| SC-011 | Edge | 복원 시 동일 이름 충돌 | P1 |
| SC-012 | Edge | 보관 기간 만료 임박 | P2 |
| SC-050 | Error | 휴지통에 없는 항목 복원 시도 | P0 |
| SC-051 | Error | 다른 사용자 항목 복원 시도 | P0 |
| SC-052 | Error | 복원 중 NAS 오류 | P1 |

---

## 시나리오 커버리지 매트릭스

| API Endpoint | Happy | Edge | Error | Total |
|--------------|-------|------|-------|-------|
| POST /files/upload | 2 | 5 | 6 | 13 |
| POST /files/upload/many | 1 | 3 | 4 | 8 |
| GET /files/:id | 1 | 2 | 3 | 6 |
| GET /files/:id/download | 1 | 4 | 4 | 9 |
| PUT /files/:id/rename | 1 | 3 | 4 | 8 |
| POST /files/:id/move | 1 | 4 | 5 | 10 |
| DELETE /files/:id | 1 | 2 | 3 | 6 |
| **Total** | **8** | **23** | **29** | **60** |

---

## 시나리오 문서 구조

```
docs/scenarios/
├── file-management/
│   ├── README.md
│   ├── upload-scenarios.md
│   ├── download-scenarios.md
│   └── manage-scenarios.md
├── folder-management/
│   ├── README.md
│   ├── create-scenarios.md
│   └── navigation-scenarios.md
├── trash/
│   ├── README.md
│   ├── delete-scenarios.md
│   └── restore-scenarios.md
└── external-share/
    ├── README.md
    ├── link-generation-scenarios.md
    └── access-scenarios.md
```
