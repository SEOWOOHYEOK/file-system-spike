# 테스트 코드 한국어 문서화 예시

## Before (원본 코드)

```typescript
describe('TrashService', () => {
  let service: TrashService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashService,
        { provide: TRASH_REPOSITORY, useValue: mockTrashRepository },
        // ... other providers
      ],
    }).compile();

    service = module.get<TrashService>(TrashService);
    jest.clearAllMocks();
  });

  describe('previewRestore', () => {
    it('should return available status when folder exists by pathname', async () => {
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash1'] };
      
      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash1',
        fileId: 'file1',
        originalPath: '/projects/2024/',
        originalFolderId: 'folder-old',
        isFile: () => true,
      });

      mockFileRepository.findById.mockResolvedValue({
        id: 'file1',
        name: 'report.pdf',
      });

      mockFolderRepository.findOne.mockResolvedValue({
        id: 'folder-new',
        path: '/projects/2024/',
      });

      mockFileRepository.existsByNameInFolder.mockResolvedValue(false);

      const result = await service.previewRestore(request);

      expect(result.items[0]).toEqual(expect.objectContaining({
        trashMetadataId: 'trash1',
        pathStatus: RestorePathStatus.AVAILABLE,
        resolveFolderId: 'folder-new',
        hasConflict: false,
      }));
    });
  });
});
```

## After (한국어 문서화 적용)

```typescript
/**
 * ============================================================
 * 📦 휴지통 서비스 (TrashService) 테스트
 * ============================================================
 * 
 * 🎯 테스트 대상:
 *   - TrashService 클래스의 모든 공개 메서드
 *   
 * 📋 비즈니스 맥락:
 *   - 휴지통은 사용자가 삭제한 파일/폴더를 임시 보관하는 기능
 *   - 사용자는 휴지통에서 파일을 복원하거나 영구 삭제할 수 있음
 *   - 복원 시 원본 경로가 존재하지 않으면 대체 경로를 선택해야 함
 * 
 * 🔗 관련 요구사항:
 *   - 휴지통 목록 조회 기능
 *   - 파일/폴더 복원 기능 (미리보기 + 실행)
 *   - 영구 삭제 기능 (개별 + 전체 비우기)
 *   - 복원 상태 조회 기능
 * 
 * ⚠️ 중요 고려사항:
 *   - 복원 시 원본 폴더가 삭제되었을 수 있음 (경로 기반 재검색 필요)
 *   - 동일 이름 파일이 이미 존재할 수 있음 (충돌 처리)
 *   - 복원은 비동기 작업으로 큐에서 처리됨
 * ============================================================
 */
describe('TrashService', () => {
  let service: TrashService;

  /**
   * 🔧 테스트 환경 설정
   * 
   * 각 테스트 전에 새로운 NestJS 모듈을 생성하고
   * 모든 의존성을 Mock으로 주입하여 격리된 테스트 환경을 구성.
   * 
   * 📍 Mock 주입 목록:
   *   - TRASH_REPOSITORY: 휴지통 메타데이터 저장소
   *   - FILE_REPOSITORY: 파일 정보 저장소
   *   - FOLDER_REPOSITORY: 폴더 정보 저장소
   *   - JOB_QUEUE_PORT: 비동기 작업 큐
   *   - SYNC_EVENT_REPOSITORY: 동기화 이벤트 저장소
   */
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashService,
        { provide: TRASH_REPOSITORY, useValue: mockTrashRepository },
        { provide: TRASH_QUERY_SERVICE, useValue: mockTrashQueryService },
        { provide: FILE_REPOSITORY, useValue: mockFileRepository },
        { provide: FILE_STORAGE_OBJECT_REPOSITORY, useValue: mockFileStorageObjectRepository },
        { provide: FOLDER_REPOSITORY, useValue: mockFolderRepository },
        { provide: FOLDER_STORAGE_OBJECT_REPOSITORY, useValue: mockFolderStorageObjectRepository },
        { provide: JOB_QUEUE_PORT, useValue: mockJobQueuePort },
        { provide: SYNC_EVENT_REPOSITORY, useValue: mockSyncEventRepository },
      ],
    }).compile();

    service = module.get<TrashService>(TrashService);
    
    // 📌 각 테스트 간 격리를 위해 모든 Mock 호출 기록 초기화
    jest.clearAllMocks();
  });

  /**
   * ============================================================
   * 📂 복원 미리보기 (previewRestore) 테스트 그룹
   * ============================================================
   * 
   * 🎯 기능 설명:
   *   복원 실행 전에 각 휴지통 아이템의 복원 가능 상태를 미리 확인.
   *   사용자가 복원 전에 잠재적 문제(경로 없음, 이름 충돌)를 파악할 수 있도록 함.
   * 
   * 📊 검사 항목:
   *   - 원본 경로 존재 여부 (AVAILABLE / NOT_FOUND)
   *   - 이름 충돌 여부 (hasConflict)
   *   - 복원 대상 폴더 ID (resolveFolderId)
   * 
   * 💡 비즈니스 규칙:
   *   - 원본 폴더 ID가 아닌 "경로명"으로 폴더를 재검색
   *   - 이유: 원본 폴더가 삭제 후 같은 경로에 새 폴더가 생성되었을 수 있음
   */
  describe('previewRestore', () => {
    
    /**
     * 📌 테스트 시나리오: 폴더 경로가 존재할 때 AVAILABLE 상태 반환
     * 
     * 🎯 검증 목적:
     *   가장 일반적인 복원 케이스 - 원본 폴더 경로가 여전히 존재하고
     *   동일 이름 파일이 없을 때 정상적으로 복원 가능함을 확인.
     * 
     * 📊 테스트 조건:
     *   - 휴지통에 파일 1개 존재
     *   - 원본 경로 '/projects/2024/'가 시스템에 존재
     *   - 해당 폴더에 같은 이름의 파일 없음
     * 
     * ✅ 기대 결과:
     *   - pathStatus: AVAILABLE (복원 가능)
     *   - resolveFolderId: 경로로 찾은 폴더 ID
     *   - hasConflict: false (충돌 없음)
     * 
     * 💡 참고:
     *   originalFolderId('folder-old')가 아닌 경로명으로 찾은
     *   'folder-new'가 resolveFolderId로 반환되는 것이 핵심
     */
    it('should return available status when folder exists by pathname', async () => {
      
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      
      // 🔧 복원 미리보기 요청 데이터
      //    - 휴지통 메타데이터 ID 'trash1'에 대해 미리보기 요청
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash1'] };
      
      /**
       * 🎭 Mock 설정: 휴지통 메타데이터 조회
       * 
       * 📍 실제 동작: 휴지통 메타데이터 테이블에서 ID로 조회
       * 📍 Mock 이유: 실제 DB 없이 특정 시나리오 재현
       * 📍 반환값 의미: 
       *    - originalPath: 파일이 삭제되기 전 위치했던 경로
       *    - originalFolderId: 삭제 당시 폴더의 ID (이 ID의 폴더는 이미 삭제되었을 수 있음)
       *    - isFile(): 파일인지 폴더인지 구분하는 도메인 메서드
       */
      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash1',
        fileId: 'file1',
        originalPath: '/projects/2024/',
        originalFolderId: 'folder-old',  // 💡 이 ID의 폴더는 이미 삭제되었을 수 있음
        isFile: () => true,
        isFolder: () => false,
      });

      /**
       * 🎭 Mock 설정: 파일 정보 조회
       * 
       * 📍 실제 동작: 파일 테이블에서 상세 정보 조회
       * 📍 반환값 의미: 휴지통에 있는 파일의 기본 정보
       */
      mockFileRepository.findById.mockResolvedValue({
        id: 'file1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        deletedAt: new Date(),
      });

      /**
       * 🎭 Mock 설정: 경로명으로 폴더 조회 (핵심!)
       * 
       * 📍 실제 동작: 폴더 테이블에서 경로가 일치하는 활성 폴더 검색
       * 📍 핵심 포인트: originalFolderId가 아닌 originalPath로 검색
       * 📍 반환값 의미: 
       *    - 'folder-new': 같은 경로에 있는 (새로 생성되었을 수 있는) 폴더
       *    - 이 폴더가 복원 대상 폴더가 됨
       */
      mockFolderRepository.findOne.mockResolvedValue({
        id: 'folder-new',  // 💡 originalFolderId('folder-old')와 다름!
        path: '/projects/2024/',
        state: FolderState.ACTIVE,
      });

      /**
       * 🎭 Mock 설정: 이름 충돌 검사
       * 
       * 📍 실제 동작: 해당 폴더에 같은 이름의 파일이 있는지 확인
       * 📍 반환값 의미: false = 충돌 없음, 복원 가능
       */
      mockFileRepository.existsByNameInFolder.mockResolvedValue(false);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      
      // 📝 복원 미리보기 API 호출
      //    주어진 휴지통 아이템들의 복원 가능 상태를 일괄 조회
      const result = await service.previewRestore(request);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      
      /**
       * 🔍 검증 1: 개별 아이템 상태 확인
       * 
       * - trashMetadataId: 요청한 휴지통 메타데이터 ID
       * - pathStatus: AVAILABLE = 원본 경로가 존재하여 복원 가능
       * - resolveFolderId: 'folder-new' = 경로로 찾은 폴더 ID (중요!)
       * - hasConflict: false = 이름 충돌 없음
       */
      expect(result.items[0]).toEqual(expect.objectContaining({
        trashMetadataId: 'trash1',
        pathStatus: RestorePathStatus.AVAILABLE,
        resolveFolderId: 'folder-new',  // 💡 originalFolderId가 아닌 새로 찾은 폴더!
        hasConflict: false,
      }));
      
      /**
       * 🔍 검증 2: 요약 통계 확인
       * 
       * - available: 1 = 복원 가능한 아이템 수
       */
      expect(result.summary.available).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 원본 폴더가 존재하지 않을 때 NOT_FOUND 상태 반환
     * 
     * 🎯 검증 목적:
     *   원본 폴더가 삭제되고 같은 경로에 새 폴더도 없는 경우를 처리.
     *   사용자에게 대체 복원 경로를 선택하도록 안내해야 함.
     * 
     * 📊 테스트 조건:
     *   - 원본 경로 '/archive/old/'가 시스템에 존재하지 않음
     * 
     * ✅ 기대 결과:
     *   - pathStatus: NOT_FOUND
     *   - resolveFolderId: null (복원할 폴더 없음)
     * 
     * 💡 실제 사용 시나리오:
     *   사용자가 '/archive/old/file.txt' 삭제 후,
     *   '/archive/old/' 폴더 자체도 삭제한 경우
     */
    it('should return not found status when folder does not exist', async () => {
      // Given: 휴지통 아이템은 있지만 원본 경로가 없는 상황
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash2'] };
      
      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash2',
        fileId: 'file2',
        originalPath: '/archive/old/',
        originalFolderId: 'folder-deleted',
        isFile: () => true,
      });

      mockFileRepository.findById.mockResolvedValue({
        id: 'file2',
        name: 'old.txt',
      });

      // 💡 핵심: 경로로 폴더를 찾았지만 결과 없음
      mockFolderRepository.findOne.mockResolvedValue(null);

      // When: 복원 미리보기 실행
      const result = await service.previewRestore(request);

      // Then: NOT_FOUND 상태 및 resolveFolderId가 null
      expect(result.items[0]).toEqual(expect.objectContaining({
        pathStatus: RestorePathStatus.NOT_FOUND,
        resolveFolderId: null,  // 💡 복원할 폴더가 없음
      }));
      expect(result.summary.notFound).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 동일 이름 파일이 이미 존재할 때 충돌 감지
     * 
     * 🎯 검증 목적:
     *   복원하려는 파일과 같은 이름의 파일이 대상 폴더에 이미 있을 때
     *   충돌을 정확히 감지하는지 확인.
     * 
     * 📊 테스트 조건:
     *   - 원본 경로 '/docs/'는 존재
     *   - 해당 폴더에 'duplicate.txt' 파일이 이미 존재
     * 
     * ✅ 기대 결과:
     *   - hasConflict: true
     *   - summary.conflict 카운트 증가
     * 
     * 💡 사용자 시나리오:
     *   A 파일 삭제 → 같은 이름의 B 파일 업로드 → A 파일 복원 시도 시 충돌
     */
    it('should detect conflict when file with same name exists', async () => {
      // Given: 복원 대상과 동일한 이름의 파일이 이미 존재하는 상황
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash3'] };
      
      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash3',
        fileId: 'file3',
        originalPath: '/docs/',
        isFile: () => true,
      });

      mockFileRepository.findById.mockResolvedValue({
        id: 'file3',
        name: 'duplicate.txt',  // 💡 이 이름이 충돌의 원인
        mimeType: 'text/plain',
        createdAt: new Date('2024-01-01'),
      });

      mockFolderRepository.findOne.mockResolvedValue({
        id: 'folder-exist',
        path: '/docs/',
      });

      // 💡 핵심: 같은 이름의 파일이 이미 존재
      mockFileRepository.existsByNameInFolder.mockResolvedValue(true);

      // When
      const result = await service.previewRestore(request);

      // Then: 충돌 플래그가 true
      expect(result.items[0]).toEqual(expect.objectContaining({
        hasConflict: true,
      }));
      expect(result.summary.conflict).toBe(1);
    });
  });
});
```

## 주요 변경 포인트

### 1. 파일 상단 - 전체 맥락 제공

```typescript
// Before: 설명 없음
describe('TrashService', () => {

// After: 비즈니스 맥락과 테스트 범위 명시
/**
 * ============================================================
 * 📦 휴지통 서비스 (TrashService) 테스트
 * ============================================================
 * 
 * 🎯 테스트 대상: ...
 * 📋 비즈니스 맥락: ...
 */
describe('TrashService', () => {
```

### 2. describe 블록 - 기능 그룹 설명

```typescript
// Before: 기능명만 있음
describe('previewRestore', () => {

// After: 기능의 목적과 검사 항목 명시
/**
 * 📂 복원 미리보기 (previewRestore) 테스트 그룹
 * 
 * 🎯 기능 설명: ...
 * 📊 검사 항목: ...
 * 💡 비즈니스 규칙: ...
 */
describe('previewRestore', () => {
```

### 3. it 블록 - 시나리오 완전 설명

```typescript
// Before: 영어 설명만 있음
it('should return available status when folder exists', async () => {

// After: 한국어로 검증 목적과 기대 결과 명시
/**
 * 📌 테스트 시나리오: 폴더 경로가 존재할 때 AVAILABLE 상태 반환
 * 
 * 🎯 검증 목적: ...
 * 📊 테스트 조건: ...
 * ✅ 기대 결과: ...
 */
it('should return available status when folder exists', async () => {
```

### 4. Mock - 왜 이 값인지 설명

```typescript
// Before: Mock 설정만 있음
mockFolderRepository.findOne.mockResolvedValue({
  id: 'folder-new',
  path: '/projects/2024/',
});

// After: Mock의 의미와 핵심 포인트 설명
/**
 * 🎭 Mock 설정: 경로명으로 폴더 조회 (핵심!)
 * 
 * 📍 핵심 포인트: originalFolderId가 아닌 originalPath로 검색
 * 📍 반환값 의미: 같은 경로에 있는 (새로 생성되었을 수 있는) 폴더
 */
mockFolderRepository.findOne.mockResolvedValue({
  id: 'folder-new',  // 💡 originalFolderId('folder-old')와 다름!
  path: '/projects/2024/',
});
```

### 5. Assertion - 각 검증의 의도 설명

```typescript
// Before: 검증만 있음
expect(result.items[0]).toEqual(expect.objectContaining({
  resolveFolderId: 'folder-new',
}));

// After: 왜 이 값을 검증하는지 설명
/**
 * 🔍 검증 1: 개별 아이템 상태 확인
 * 
 * - resolveFolderId: 'folder-new' = 경로로 찾은 폴더 ID (중요!)
 */
expect(result.items[0]).toEqual(expect.objectContaining({
  resolveFolderId: 'folder-new',  // 💡 originalFolderId가 아닌 새로 찾은 폴더!
}));
```

## 이모지 사용 가이드

| 이모지 | 용도 |
|-------|------|
| 📦 | 테스트 대상 (클래스/모듈) |
| 📂 | 기능 그룹 (describe) |
| 📌 | 테스트 시나리오 (it) |
| 🎯 | 검증 목적 / 테스트 대상 |
| 📋 | 비즈니스 맥락 |
| 📊 | 테스트 조건 / 검사 항목 |
| ✅ | 기대 결과 |
| 💡 | 핵심 포인트 / 참고사항 |
| 🔧 | 설정 / 데이터 |
| 🎭 | Mock 설정 |
| 📍 | 세부 설명 포인트 |
| 📥 | Given (입력/조건) |
| 🎬 | When (실행) |
| 🔍 | Then (검증) |
| ⚠️ | 주의사항 |
