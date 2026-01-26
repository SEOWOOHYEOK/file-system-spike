# Hybrid Storage Architecture with Graceful Fallback

## 📋 개요

이 문서는 SeaweedFS를 캐싱 레이어로, NAS를 영구 저장소로 사용하는 하이브리드 스토리지 아키텍처를 설명합니다.

---

## 🏗️ 아키텍처 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Application                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           File Server (NestJS)                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Upload Service  │  │ Download Service│  │ Health Monitor Service      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Cache Manager   │  │ Sync Service    │  │ Eviction Policy Manager     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                                    │
        ┌───────────┴───────────┐          ┌────────────┴────────────┐
        ▼                       ▼          ▼                         ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────────────┐
│   SeaweedFS       │   │   PostgreSQL      │   │         NAS               │
│   (Cache Layer)   │   │   (Metadata DB)   │   │   (Permanent Storage)     │
│                   │   │                   │   │                           │
│ • S3 Gateway      │   │ • File metadata   │   │ • Long-term storage       │
│ • Fast access     │   │ • Cache status    │   │ • Archive files           │
│ • Temporary store │   │ • Sync history    │   │ • Backup destination      │
└───────────────────┘   └───────────────────┘   └───────────────────────────┘
```

---

## 🔄 데이터 흐름

### 1. 업로드 플로우 (Upload Flow)

```
┌──────────┐     ┌─────────────┐     ┌───────────┐     ┌─────────────┐     ┌─────┐
│  Client  │────▶│ File Server │────▶│ SeaweedFS │────▶│ Sync Worker │────▶│ NAS │
└──────────┘     └─────────────┘     └───────────┘     └─────────────┘     └─────┘
                        │                   │                  │
                        ▼                   ▼                  ▼
                 ┌─────────────┐     ┌───────────┐     ┌─────────────┐
                 │  Response   │     │  Metadata │     │  Cleanup    │
                 │  (Immediate)│     │  (DB Save)│     │  (Optional) │
                 └─────────────┘     └───────────┘     └─────────────┘
```

#### 상세 단계:

1. **클라이언트 업로드 요청**
   - 파일을 File Server로 전송

2. **SeaweedFS 저장 (즉시)**
   - S3 Gateway를 통해 SeaweedFS에 파일 저장
   - 클라이언트에게 즉시 응답 반환 (빠른 UX)

3. **메타데이터 기록**
   - PostgreSQL에 파일 메타데이터 저장
   - `cache_status: 'cached'`, `nas_status: 'pending'`

4. **비동기 NAS 동기화**
   - Background Worker가 주기적으로 실행
   - SeaweedFS → NAS 파일 복사
   - 성공 시 `nas_status: 'synced'` 업데이트

5. **캐시 정리 (선택적)**
   - Eviction Policy에 따라 오래된 캐시 파일 삭제

---

### 2. 다운로드 플로우 (Download Flow) - Graceful Fallback

```
┌──────────┐     ┌─────────────┐     ┌───────────────────────────────────┐
│  Client  │────▶│ File Server │────▶│       Cache Check Logic           │
└──────────┘     └─────────────┘     └───────────────────────────────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                     ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                     │ Cache Hit   │       │ Cache Miss  │       │ Fallback    │
                     │ (SeaweedFS) │       │ (Read-Through)      │ (NAS Direct)│
                     └─────────────┘       └─────────────┘       └─────────────┘
                              │                     │                     │
                              ▼                     ▼                     ▼
                     ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                     │ Return File │       │ Load to Cache       │ Return File │
                     │ (Fast)      │       │ + Return    │       │ (Slow)      │
                     └─────────────┘       └─────────────┘       └─────────────┘
```

#### 케이스별 처리:

| Case | SeaweedFS | NAS | 동작 |
|------|-----------|-----|------|
| A | ✅ 있음 | ✅ 있음 | SeaweedFS에서 즉시 반환 |
| B | ❌ 없음 | ✅ 있음 | NAS에서 읽고 → 비동기로 캐시 적재 → 반환 |
| C | ✅ 있음 | ❌ 없음 | SeaweedFS에서 반환 (동기화 대기 중 상태) |
| D | ❌ 없음 | ❌ 없음 | 404 에러 반환 |
| E | ⚠️ 장애 | ✅ 있음 | NAS에서 직접 반환 (Graceful Fallback) |

---

### 3. 동기화 플로우 (Sync Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Sync Worker (Background Job)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  Query: nas_status = 'pending' │
              │  Order: created_at ASC (FIFO)  │
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  For each pending file:       │
              │  1. Read from SeaweedFS       │
              │  2. Write to NAS              │
              │  3. Verify integrity (hash)   │
              │  4. Update DB status          │
              └───────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        ┌─────────────┐             ┌─────────────┐
        │   Success   │             │   Failure   │
        │             │             │             │
        │ nas_status  │             │ retry_count │
        │ = 'synced'  │             │ += 1        │
        └─────────────┘             └─────────────┘
```

---

### 4. 캐시 제거 플로우 (Cache Eviction Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│               Eviction Worker (Scheduled Job)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  Check Cache Storage Usage    │
              │  Threshold: 80% capacity      │
              └───────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌─────────────┐                 ┌─────────────┐
      │ Under 80%   │                 │ Over 80%    │
      │ (No Action) │                 │ (Evict)     │
      └─────────────┘                 └─────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  Select files for eviction:   │
                              │  - nas_status = 'synced'      │
                              │  - Policy: LRU / LFU / FIFO   │
                              └───────────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  Delete from SeaweedFS        │
                              │  Update: cache_status = null  │
                              └───────────────────────────────┘
```

---

## 📊 데이터베이스 스키마

### File Metadata Table

```sql
CREATE TABLE file_metadata (
    id              UUID PRIMARY KEY,
    original_name   VARCHAR(255) NOT NULL,
    stored_name     VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100),
    size            BIGINT NOT NULL,
    hash            VARCHAR(64),          -- SHA-256
    
    -- Storage Status
    seaweed_fid     VARCHAR(100),         -- SeaweedFS File ID
    cache_status    VARCHAR(20),          -- 'cached' | null
    nas_path        VARCHAR(500),         -- NAS 저장 경로
    nas_status      VARCHAR(20),          -- 'pending' | 'syncing' | 'synced' | 'failed'
    
    -- Sync Tracking
    sync_attempts   INTEGER DEFAULT 0,
    last_sync_at    TIMESTAMP,
    synced_at       TIMESTAMP,
    
    -- Cache Metadata
    last_accessed   TIMESTAMP,            -- LRU용
    access_count    INTEGER DEFAULT 0,    -- LFU용
    
    -- Timestamps
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_nas_status ON file_metadata(nas_status);
CREATE INDEX idx_cache_status ON file_metadata(cache_status);
CREATE INDEX idx_last_accessed ON file_metadata(last_accessed);
```

---

## ⚙️ 설정 옵션

### 환경 변수

```env
# SeaweedFS Configuration
SEAWEED_MASTER_URL=http://localhost:9333
SEAWEED_S3_ENDPOINT=http://localhost:8333
SEAWEED_S3_ACCESS_KEY=your-access-key
SEAWEED_S3_SECRET_KEY=your-secret-key
SEAWEED_S3_BUCKET=file-cache

# NAS Configuration
NAS_ROOT_PATH=\\\\192.168.10.249\\Web\\storage
NAS_MOUNT_TYPE=unc  # unc | nfs | smb

# Cache Configuration
CACHE_EVICTION_POLICY=LRU           # LRU | LFU | FIFO
CACHE_THRESHOLD_PERCENT=80          # 용량 80% 초과 시 제거 시작
CACHE_EVICTION_BATCH_SIZE=100       # 한 번에 제거할 파일 수

# Sync Configuration
SYNC_INTERVAL_MS=60000              # 동기화 주기 (1분)
SYNC_BATCH_SIZE=50                  # 한 번에 동기화할 파일 수
SYNC_MAX_RETRIES=3                  # 최대 재시도 횟수

# Health Check
HEALTH_CHECK_INTERVAL_MS=30000      # 헬스체크 주기
SEAWEED_TIMEOUT_MS=5000             # SeaweedFS 타임아웃
NAS_TIMEOUT_MS=10000                # NAS 타임아웃
```

---

## 🛡️ 장애 대응 (Graceful Fallback)

### SeaweedFS 장애 시

```
┌─────────────────────────────────────────────────────────────────┐
│                   SeaweedFS Health Check                         │
│                   Status: UNHEALTHY ⚠️                           │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌─────────────────┐             ┌─────────────────┐
      │ Download Request│             │ Upload Request  │
      └─────────────────┘             └─────────────────┘
              │                               │
              ▼                               ▼
      ┌─────────────────┐             ┌─────────────────┐
      │ Fallback to NAS │             │ Direct to NAS   │
      │ (Read-only)     │             │ (Write-through) │
      └─────────────────┘             └─────────────────┘
              │                               │
              ▼                               ▼
      ┌─────────────────┐             ┌─────────────────┐
      │ Return file     │             │ Queue for cache │
      │ from NAS        │             │ when recovered  │
      └─────────────────┘             └─────────────────┘
```

### NAS 장애 시

```
┌─────────────────────────────────────────────────────────────────┐
│                      NAS Health Check                            │
│                      Status: UNHEALTHY ⚠️                        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌─────────────────┐             ┌─────────────────┐
      │ Download Request│             │ Sync Worker     │
      └─────────────────┘             └─────────────────┘
              │                               │
              ▼                               ▼
      ┌─────────────────┐             ┌─────────────────┐
      │ Serve from      │             │ Pause Sync      │
      │ SeaweedFS only  │             │ Keep in cache   │
      └─────────────────┘             └─────────────────┘
              │                               │
              ▼                               ▼
      ┌─────────────────┐             ┌─────────────────┐
      │ Warning: File   │             │ Resume when     │
      │ may not be safe │             │ NAS recovers    │
      └─────────────────┘             └─────────────────┘
```

---

## 📈 모니터링 메트릭

### 핵심 메트릭

| 메트릭 | 설명 | 알람 임계값 |
|--------|------|-------------|
| `cache_hit_rate` | 캐시 히트율 | < 70% |
| `cache_usage_percent` | 캐시 사용률 | > 90% |
| `sync_queue_size` | 동기화 대기 파일 수 | > 1000 |
| `sync_failure_rate` | 동기화 실패율 | > 5% |
| `seaweed_health` | SeaweedFS 상태 | unhealthy |
| `nas_health` | NAS 상태 | unhealthy |
| `avg_download_latency` | 평균 다운로드 지연 | > 500ms |

### 로그 형식

```json
{
  "timestamp": "2026-01-12T10:30:00Z",
  "level": "INFO",
  "service": "file-server",
  "action": "download",
  "fileId": "uuid",
  "source": "seaweedfs",  // seaweedfs | nas | fallback
  "latencyMs": 45,
  "cacheHit": true
}
```

---

## 🔧 구현 체크리스트

### Phase 1: 기본 구조
- [ ] File Metadata Entity 생성
- [ ] SeaweedFS S3 클라이언트 구현
- [ ] NAS 파일 시스템 서비스 구현
- [ ] 기본 업로드/다운로드 API

### Phase 2: 캐싱 레이어
- [ ] Cache Manager 서비스 구현
- [ ] Read-Through 캐시 로직 구현
- [ ] Cache Hit/Miss 추적

### Phase 3: 동기화
- [ ] Sync Worker 구현 (Bull Queue 사용)
- [ ] FIFO 동기화 로직
- [ ] 재시도 메커니즘

### Phase 4: 캐시 제거
- [ ] Eviction Policy Manager 구현
- [ ] LRU/LFU/FIFO 정책 구현
- [ ] 스케줄러 설정

### Phase 5: 장애 대응
- [ ] Health Check 서비스 구현
- [ ] Fallback 로직 구현
- [ ] Circuit Breaker 패턴 적용

### Phase 6: 모니터링
- [ ] 메트릭 수집 구현
- [ ] 대시보드 구성
- [ ] 알람 설정

---

## 📚 참고 사항

### 장점
1. **빠른 응답**: 업로드 시 즉시 응답 (SeaweedFS 저장 후)
2. **안정성**: NAS 영구 저장으로 데이터 안전성 확보
3. **유연성**: Graceful Fallback으로 장애 대응
4. **비용 효율**: 자주 접근하는 파일만 캐시 유지

### 주의 사항
1. **동기화 지연**: NAS 동기화까지 시간 소요 (데이터 유실 위험 구간)
2. **일관성**: 동기화 전 SeaweedFS 장애 시 데이터 유실 가능
3. **복잡성**: 두 스토리지 관리로 운영 복잡도 증가

### 권장 사항
1. **중요 파일**: `sync_priority: high` 설정으로 즉시 동기화
2. **백업**: SeaweedFS 볼륨 복제 설정 권장
3. **모니터링**: 동기화 큐 크기 지속 모니터링

---

*문서 버전: 1.0.0*  
*최종 수정: 2026-01-12*
