# 🔌 느슨한 결합 로깅 아키텍처

> 비즈니스 로직과 로깅의 분리를 통한 유연하고 안정적인 시스템

---

## 📋 목차

1. [문제 정의](#1-문제-정의)
2. [설계 원칙](#2-설계-원칙)
3. [아키텍처 개요](#3-아키텍처-개요)
4. [이벤트 기반 로깅](#4-이벤트-기반-로깅)
5. [데코레이터 패턴](#5-데코레이터-패턴)
6. [장애 격리](#6-장애-격리)
7. [런타임 구성](#7-런타임-구성)
8. [구현 가이드](#8-구현-가이드)
9. [테스트 전략](#9-테스트-전략)

---

## 1. 문제 정의

### 1.1 긴밀한 결합(Tight Coupling)의 문제점

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ❌ 긴밀한 결합 - 문제 상황                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // 비즈니스 로직에 로깅이 직접 포함된 경우                                 │
│  async uploadFile(file) {                                                   │
│    this.logger.info('파일 업로드 시작', { file });     // ❌ 결합          │
│    try {                                                                    │
│      await this.elkLogger.startSpan('upload');          // ❌ ELK 종속     │
│      const result = await this.seaweed.put(file);                           │
│      await this.elkLogger.endSpan({ success: true });   // ❌ ELK 종속     │
│      this.auditLogger.logAction('FILE_UPLOAD', ...);    // ❌ 결합          │
│      return result;                                                         │
│    } catch (error) {                                                        │
│      this.elkLogger.logError(error);                    // ❌ 로깅 실패시  │
│      throw error;                                       //    비즈니스 영향│
│    }                                                                        │
│  }                                                                          │
│                                                                             │
│  문제점:                                                                    │
│  ────────                                                                   │
│  1. ELK 장애 → uploadFile 실패 가능성                                      │
│  2. 로깅 구현체 변경 시 모든 서비스 코드 수정 필요                         │
│  3. 단위 테스트 시 로거 모킹 필수                                          │
│  4. 로깅 로직이 비즈니스 로직 가독성 저하                                  │
│  5. 성능: 동기 로깅이 응답 시간에 영향                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 결합도 분석

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      현재 파일 프로세스의 로깅 포인트                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  파일 업로드 프로세스 (7단계)                                               │
│  ─────────────────────────────                                              │
│                                                                             │
│  [Step 1] 파일 검증       → 로그: 시작, 검증 결과, 오류                    │
│      │                                                                      │
│      ▼                                                                      │
│  [Step 2] SeaweedFS 저장  → 로그: 시작, 완료, FID, 소요시간, 오류          │
│      │                                                                      │
│      ▼                                                                      │
│  [Step 3] DB 저장         → 로그: INSERT 결과, document ID                 │
│      │                                                                      │
│      ▼                                                                      │
│  [Step 4] 응답 반환       → 로그: 응답 상태, 전체 소요시간                 │
│      │                                                                      │
│      ▼ (비동기)                                                             │
│  [Step 5] Tika 분석       → 로그: 시작, 추출 결과, 소요시간, 오류          │
│      │                                                                      │
│      ▼                                                                      │
│  [Step 6] NAS 동기화      → 로그: 시작, 해시검증, 완료, 오류               │
│      │                                                                      │
│      ▼                                                                      │
│  [Step 7] ES 색인         → 로그: 색인 결과, 검색 가능 상태                │
│                                                                             │
│  📊 총 로깅 포인트: 최소 21개 (단계당 평균 3개)                            │
│  ⚠️  모든 서비스에 로거 의존성 주입 필요                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 설계 원칙

### 2.1 핵심 원칙

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         느슨한 결합 설계 원칙                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1️⃣  비즈니스 로직은 로깅을 모른다 (Ignorance)                             │
│      ────────────────────────────────────────────                           │
│      • 서비스 코드에 로거 직접 주입 금지                                   │
│      • 로깅은 "외부에서" 발생                                              │
│                                                                             │
│  2️⃣  로깅 실패가 비즈니스에 영향 없음 (Fault Isolation)                   │
│      ────────────────────────────────────────────                           │
│      • 로깅 실패 = 무시 (Fire-and-Forget)                                  │
│      • 로깅 시스템 장애 ≠ 서비스 장애                                      │
│                                                                             │
│  3️⃣  런타임 변경 가능 (Runtime Configurability)                           │
│      ────────────────────────────────────────────                           │
│      • 코드 변경 없이 로깅 활성화/비활성화                                 │
│      • 동적으로 로깅 레벨, 대상 변경                                       │
│                                                                             │
│  4️⃣  교체 가능 (Swappable)                                                │
│      ────────────────────────────────────────────                           │
│      • ELK → Datadog, Splunk 등으로 쉽게 교체                              │
│      • 인터페이스 기반 추상화                                              │
│                                                                             │
│  5️⃣  성능 무영향 (Zero Performance Impact)                                │
│      ────────────────────────────────────────────                           │
│      • 비동기 처리 기본                                                    │
│      • 비즈니스 응답 시간에 로깅 시간 불포함                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 적용 패턴

| 패턴 | 용도 | 장점 |
|------|------|------|
| **Event-Driven** | 비즈니스 → 이벤트 발행, 로깅 → 이벤트 구독 | 완전한 분리 |
| **Decorator** | AOP 스타일 로깅 적용 | 코드 수정 없음 |
| **Strategy** | 로깅 구현체 교체 | 유연성 |
| **Circuit Breaker** | 로깅 시스템 장애 격리 | 안정성 |
| **Feature Flag** | 런타임 로깅 제어 | 운영 편의성 |

---

## 3. 아키텍처 개요

### 3.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    느슨한 결합 로깅 아키텍처 전체 구조                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application Layer                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Business Services                              │  │
│  │                                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │  │
│  │  │ FileUpload   │  │ FileDownload │  │  SearchSvc   │  ...           │  │
│  │  │   Service    │  │   Service    │  │              │                │  │
│  │  │              │  │              │  │              │                │  │
│  │  │ ⚡ 순수한    │  │ ⚡ 로깅      │  │ ⚡ 비즈니스  │                │  │
│  │  │   비즈니스   │  │   없음       │  │   로직만     │                │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                │  │
│  │         │                 │                 │                         │  │
│  └─────────┼─────────────────┼─────────────────┼─────────────────────────┘  │
│            │                 │                 │                            │
│            ▼                 ▼                 ▼                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Event Bus (NestJS EventEmitter)               │  │
│  │                                                                        │  │
│  │   FileUploaded │ FileDownloaded │ SearchPerformed │ ErrorOccurred     │  │
│  │   SyncStarted  │ SyncCompleted  │ CacheEvicted    │ HealthChanged     │  │
│  │                                                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
                                    │ Subscribe (Fire-and-Forget)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Logging Layer (분리됨)                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Logging Event Handler                              │  │
│  │                                                                        │  │
│  │  @OnEvent('file.*')         @OnEvent('error.*')                       │  │
│  │  handleFileEvents()         handleErrorEvents()                        │  │
│  │                                                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                         │
│                                   ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     Logging Strategy Router                            │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Feature Flag Check                            │  │  │
│  │  │                                                                  │  │  │
│  │  │  if (!featureFlags.isEnabled('logging.elk')) return;            │  │  │
│  │  │  if (!featureFlags.isEnabled('logging.audit')) skipAudit();     │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                         │
│            ┌──────────────────────┼──────────────────────┐                  │
│            ▼                      ▼                      ▼                  │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐           │
│  │  ELK Adapter    │   │  File Adapter   │   │  Null Adapter   │           │
│  │                 │   │                 │   │  (테스트용)     │           │
│  │ Circuit Breaker │   │ 로컬 파일 로깅  │   │ 아무것도 안함   │           │
│  │ 적용됨          │   │                 │   │                 │           │
│  └────────┬────────┘   └────────┬────────┘   └─────────────────┘           │
│           │                     │                                           │
└───────────┼─────────────────────┼───────────────────────────────────────────┘
            │                     │
            ▼                     ▼
     ┌─────────────┐       ┌─────────────┐
     │ Elasticsearch│       │  Log Files  │
     │ (Filebeat)   │       │ /var/log/   │
     └─────────────┘       └─────────────┘
```

### 3.2 계층 분리

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           모듈 의존성 방향                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    ┌─────────────────────────────┐                          │
│                    │      Business Module        │                          │
│                    │  (FileModule, SearchModule) │                          │
│                    │                             │                          │
│                    │  • 순수 비즈니스 로직       │                          │
│                    │  • EventEmitter만 의존      │                          │
│                    │  • 로깅 모듈 import 없음    │                          │
│                    └─────────────┬───────────────┘                          │
│                                  │                                          │
│                                  │ emit events                              │
│                                  ▼                                          │
│                    ┌─────────────────────────────┐                          │
│                    │       Event Module          │                          │
│                    │    (NestJS EventEmitter)    │                          │
│                    │                             │                          │
│                    │  • 이벤트 타입 정의         │                          │
│                    │  • 순수 데이터 전달         │                          │
│                    └─────────────┬───────────────┘                          │
│                                  │                                          │
│                                  │ subscribe (선택적)                       │
│                                  ▼                                          │
│                    ┌─────────────────────────────┐                          │
│                    │      Logging Module         │                          │
│                    │                             │                          │
│                    │  • Event Handler            │                          │
│                    │  • Strategy Router          │                          │
│                    │  • Adapters (ELK, File...)  │                          │
│                    │                             │                          │
│                    │  ⚠️ 비즈니스 모듈에 의존    │                          │
│                    │     하지 않음               │                          │
│                    └─────────────────────────────┘                          │
│                                                                             │
│  핵심: Business Module은 Logging Module의 존재를 모른다                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 이벤트 기반 로깅

### 4.1 도메인 이벤트 정의

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/domain/events/file.events.ts
// 비즈니스 이벤트 정의 (로깅과 무관한 순수 도메인 이벤트)
// ═══════════════════════════════════════════════════════════════════════════

// 기본 이벤트 인터페이스
export interface DomainEvent {
  readonly eventId: string;        // 이벤트 고유 ID
  readonly timestamp: Date;        // 발생 시간
  readonly traceId: string;        // 분산 추적 ID (요청별)
  readonly spanId?: string;        // 스팬 ID (단계별)
}

// 파일 업로드 완료 이벤트
export class FileUploadedEvent implements DomainEvent {
  readonly eventId = uuidv4();
  readonly timestamp = new Date();
  
  constructor(
    public readonly traceId: string,
    public readonly fileId: string,
    public readonly fileName: string,
    public readonly fileSize: number,
    public readonly mimeType: string,
    public readonly userId: string,
    public readonly duration: number,      // 처리 시간 (ms)
    public readonly storageLocation: 'seaweedfs' | 'nas',
  ) {}
}

// 파일 다운로드 완료 이벤트
export class FileDownloadedEvent implements DomainEvent {
  readonly eventId = uuidv4();
  readonly timestamp = new Date();
  
  constructor(
    public readonly traceId: string,
    public readonly fileId: string,
    public readonly userId: string,
    public readonly source: 'cache' | 'nas' | 'fallback',
    public readonly duration: number,
  ) {}
}

// 동기화 완료 이벤트
export class FileSyncCompletedEvent implements DomainEvent {
  readonly eventId = uuidv4();
  readonly timestamp = new Date();
  
  constructor(
    public readonly traceId: string,
    public readonly spanId: string,
    public readonly fileId: string,
    public readonly syncType: 'seaweed-to-nas' | 'nas-to-seaweed',
    public readonly success: boolean,
    public readonly duration: number,
    public readonly errorMessage?: string,
  ) {}
}

// 오류 발생 이벤트
export class ErrorOccurredEvent implements DomainEvent {
  readonly eventId = uuidv4();
  readonly timestamp = new Date();
  
  constructor(
    public readonly traceId: string,
    public readonly spanId: string | undefined,
    public readonly errorCode: string,
    public readonly errorMessage: string,
    public readonly stack: string | undefined,
    public readonly context: Record<string, any>,
    public readonly severity: 'warn' | 'error' | 'critical',
  ) {}
}

// 이벤트 이름 상수
export const FILE_EVENTS = {
  UPLOADED: 'file.uploaded',
  DOWNLOADED: 'file.downloaded',
  DELETED: 'file.deleted',
  SYNC_STARTED: 'file.sync.started',
  SYNC_COMPLETED: 'file.sync.completed',
  CACHE_HIT: 'file.cache.hit',
  CACHE_MISS: 'file.cache.miss',
  CACHE_EVICTED: 'file.cache.evicted',
} as const;

export const SYSTEM_EVENTS = {
  ERROR: 'system.error',
  HEALTH_CHANGED: 'system.health.changed',
  CIRCUIT_OPENED: 'system.circuit.opened',
  CIRCUIT_CLOSED: 'system.circuit.closed',
} as const;
```

### 4.2 비즈니스 서비스 (이벤트 발행만)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/business/file-upload/file-upload.service.ts
// 순수 비즈니스 로직 - 로거 의존성 없음!
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { 
  FileUploadedEvent, 
  ErrorOccurredEvent,
  FILE_EVENTS,
  SYSTEM_EVENTS,
} from '../../domain/events/file.events';

@Injectable()
export class FileUploadService {
  constructor(
    private readonly seaweedClient: SeaweedS3Client,
    private readonly fileRepository: FileDocumentRepository,
    private readonly eventEmitter: EventEmitter2,  // ✅ 이벤트 발행만
    // ❌ private readonly logger: Logger,         // 로거 없음!
    // ❌ private readonly elkLogger: ELKLogger,   // ELK 없음!
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    traceId: string,  // 외부에서 주입받은 추적 ID
  ): Promise<UploadResult> {
    const startTime = Date.now();

    try {
      // ═══════════════════════════════════════════════════════════════════
      // 순수 비즈니스 로직만 존재
      // 로깅 코드 없음!
      // ═══════════════════════════════════════════════════════════════════
      
      // Step 1: 검증
      await this.validateFile(file);
      const fileHash = await this.calculateHash(file.buffer);

      // Step 2: SeaweedFS 저장
      const seaweedResult = await this.seaweedClient.putObject({
        Key: this.generateStoragePath(file),
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      // Step 3: DB 저장
      const document = await this.fileRepository.create({
        uuid: uuidv4(),
        originalName: file.originalname,
        fileSize: file.size,
        seaweedFid: seaweedResult.fid,
        ownerId: userId,
        // ...
      });

      // ═══════════════════════════════════════════════════════════════════
      // 이벤트 발행 (Fire-and-Forget)
      // 이벤트 처리 실패해도 비즈니스 로직에 영향 없음
      // ═══════════════════════════════════════════════════════════════════
      this.eventEmitter.emit(
        FILE_EVENTS.UPLOADED,
        new FileUploadedEvent(
          traceId,
          document.uuid,
          document.originalName,
          document.fileSize,
          document.mimeType,
          userId,
          Date.now() - startTime,
          'seaweedfs',
        ),
      );

      return {
        id: document.uuid,
        name: document.originalName,
        size: document.fileSize,
        status: 'processing',
      };

    } catch (error) {
      // ═══════════════════════════════════════════════════════════════════
      // 에러 이벤트 발행 (Fire-and-Forget)
      // ═══════════════════════════════════════════════════════════════════
      this.eventEmitter.emit(
        SYSTEM_EVENTS.ERROR,
        new ErrorOccurredEvent(
          traceId,
          undefined,
          'FILE_UPLOAD_FAILED',
          error.message,
          error.stack,
          { fileName: file.originalname, userId },
          'error',
        ),
      );

      throw error;  // 원래 에러 그대로 전파
    }
  }
}
```

### 4.3 로깅 이벤트 핸들러 (분리된 모듈)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/infrastructure/logging/handlers/file-event.handler.ts
// 이벤트 구독 및 로깅 처리 - 비즈니스 로직과 완전 분리
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { 
  FileUploadedEvent,
  FileDownloadedEvent,
  FileSyncCompletedEvent,
  FILE_EVENTS,
} from '../../../domain/events/file.events';
import { LoggingStrategyRouter } from '../strategies/logging-strategy-router';
import { FeatureFlagService } from '../../feature-flags/feature-flag.service';

@Injectable()
export class FileEventLoggingHandler {
  constructor(
    private readonly loggingRouter: LoggingStrategyRouter,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 파일 업로드 이벤트 처리
  // async: false → Fire-and-Forget (비즈니스 로직 블로킹 없음)
  // ═══════════════════════════════════════════════════════════════════════
  @OnEvent(FILE_EVENTS.UPLOADED, { async: true })
  async handleFileUploaded(event: FileUploadedEvent): Promise<void> {
    // Feature Flag 체크 - 비활성화 시 즉시 리턴
    if (!this.featureFlags.isEnabled('logging.file-operations')) {
      return;
    }

    try {
      // 로깅 라우터가 적절한 어댑터로 전달
      await this.loggingRouter.log({
        level: 'info',
        category: 'file-operation',
        message: '파일 업로드 완료',
        traceId: event.traceId,
        data: {
          eventId: event.eventId,
          fileId: event.fileId,
          fileName: event.fileName,
          fileSize: event.fileSize,
          mimeType: event.mimeType,
          userId: event.userId,
          duration: event.duration,
          storageLocation: event.storageLocation,
        },
        timestamp: event.timestamp,
      });

      // 감사 로그 (별도 Feature Flag)
      if (this.featureFlags.isEnabled('logging.audit')) {
        await this.loggingRouter.audit({
          action: 'FILE_UPLOAD',
          userId: event.userId,
          resourceType: 'file',
          resourceId: event.fileId,
          details: {
            fileName: event.fileName,
            fileSize: event.fileSize,
          },
          traceId: event.traceId,
          timestamp: event.timestamp,
        });
      }
    } catch (error) {
      // ⚠️ 로깅 실패는 조용히 처리 - 비즈니스에 영향 없음
      console.error('[LoggingHandler] Failed to log event:', error.message);
      // 메트릭만 기록 (선택적)
      this.loggingRouter.incrementMetric('logging.failures');
    }
  }

  @OnEvent(FILE_EVENTS.DOWNLOADED, { async: true })
  async handleFileDownloaded(event: FileDownloadedEvent): Promise<void> {
    if (!this.featureFlags.isEnabled('logging.file-operations')) {
      return;
    }

    try {
      await this.loggingRouter.log({
        level: 'info',
        category: 'file-operation',
        message: '파일 다운로드 완료',
        traceId: event.traceId,
        data: {
          fileId: event.fileId,
          userId: event.userId,
          source: event.source,
          duration: event.duration,
        },
        timestamp: event.timestamp,
      });
    } catch (error) {
      // 무시
    }
  }

  // 와일드카드 패턴으로 모든 파일 이벤트 캐치 가능
  @OnEvent('file.**', { async: true })
  async handleAllFileEvents(event: any): Promise<void> {
    // 디버그 모드에서만 모든 이벤트 로깅
    if (this.featureFlags.isEnabled('logging.debug')) {
      await this.loggingRouter.debug({
        message: 'File event received',
        event: event,
      });
    }
  }
}
```

---

## 5. 데코레이터 패턴

### 5.1 메서드 레벨 로깅 데코레이터

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/infrastructure/logging/decorators/logged.decorator.ts
// AOP 스타일 로깅 - 코드 수정 없이 로깅 적용
// ═══════════════════════════════════════════════════════════════════════════

import { SetMetadata } from '@nestjs/common';

// 로깅 메타데이터 키
export const LOGGED_METHOD_KEY = 'logged_method';

// 로깅 옵션 인터페이스
export interface LoggedOptions {
  operation: string;           // 작업 이름
  category?: string;           // 로그 카테고리
  logParams?: boolean;         // 파라미터 로깅 여부
  logResult?: boolean;         // 결과 로깅 여부
  sensitiveParams?: string[];  // 마스킹할 파라미터
  featureFlag?: string;        // 로깅 활성화 Feature Flag
}

// 데코레이터 정의
export const Logged = (options: LoggedOptions): MethodDecorator => {
  return SetMetadata(LOGGED_METHOD_KEY, options);
};

// ═══════════════════════════════════════════════════════════════════════════
// src/infrastructure/logging/interceptors/logging.interceptor.ts
// 데코레이터를 처리하는 인터셉터
// ═══════════════════════════════════════════════════════════════════════════

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError } from 'rxjs';
import { LoggingStrategyRouter } from '../strategies/logging-strategy-router';
import { FeatureFlagService } from '../../feature-flags/feature-flag.service';
import { LOGGED_METHOD_KEY, LoggedOptions } from '../decorators/logged.decorator';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly loggingRouter: LoggingStrategyRouter,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 데코레이터 메타데이터 조회
    const loggedOptions = this.reflector.get<LoggedOptions>(
      LOGGED_METHOD_KEY,
      context.getHandler(),
    );

    // @Logged 데코레이터가 없으면 패스스루
    if (!loggedOptions) {
      return next.handle();
    }

    // Feature Flag 체크
    if (loggedOptions.featureFlag && 
        !this.featureFlags.isEnabled(loggedOptions.featureFlag)) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const traceId = request.headers['x-trace-id'] || uuidv4();
    const startTime = Date.now();
    const className = context.getClass().name;
    const methodName = context.getHandler().name;

    // 파라미터 추출 및 마스킹
    const params = loggedOptions.logParams
      ? this.maskSensitiveParams(request.body, loggedOptions.sensitiveParams)
      : undefined;

    return next.handle().pipe(
      tap((result) => {
        // 성공 로깅 (비동기, Fire-and-Forget)
        setImmediate(() => {
          this.loggingRouter.log({
            level: 'info',
            category: loggedOptions.category || 'method-call',
            message: `${loggedOptions.operation} 완료`,
            traceId,
            data: {
              class: className,
              method: methodName,
              duration: Date.now() - startTime,
              params,
              result: loggedOptions.logResult ? this.truncateResult(result) : undefined,
            },
            timestamp: new Date(),
          }).catch(() => {}); // 로깅 실패 무시
        });
      }),
      catchError((error) => {
        // 에러 로깅 (비동기, Fire-and-Forget)
        setImmediate(() => {
          this.loggingRouter.log({
            level: 'error',
            category: loggedOptions.category || 'method-call',
            message: `${loggedOptions.operation} 실패`,
            traceId,
            data: {
              class: className,
              method: methodName,
              duration: Date.now() - startTime,
              params,
              error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
              },
            },
            timestamp: new Date(),
          }).catch(() => {}); // 로깅 실패 무시
        });

        throw error; // 원래 에러 전파
      }),
    );
  }

  private maskSensitiveParams(
    params: any, 
    sensitiveKeys?: string[],
  ): any {
    if (!params || !sensitiveKeys?.length) return params;
    
    const masked = { ...params };
    for (const key of sensitiveKeys) {
      if (masked[key]) {
        masked[key] = '***MASKED***';
      }
    }
    return masked;
  }

  private truncateResult(result: any): any {
    const str = JSON.stringify(result);
    if (str.length > 1000) {
      return { _truncated: true, length: str.length };
    }
    return result;
  }
}
```

### 5.2 데코레이터 사용 예시

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/business/file-upload/file-upload.service.ts
// 데코레이터 방식 로깅 적용 - 코드 침투 최소화
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable } from '@nestjs/common';
import { Logged } from '../../infrastructure/logging/decorators/logged.decorator';

@Injectable()
export class FileUploadService {
  constructor(
    private readonly seaweedClient: SeaweedS3Client,
    private readonly fileRepository: FileDocumentRepository,
    // ❌ 로거 주입 없음!
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // @Logged 데코레이터로 로깅 적용
  // 비즈니스 코드는 완전히 깨끗하게 유지
  // ═══════════════════════════════════════════════════════════════════════
  @Logged({
    operation: '파일 업로드',
    category: 'file-operation',
    logParams: true,
    sensitiveParams: ['password', 'token'],  // 마스킹
    featureFlag: 'logging.file-operations',
  })
  async uploadFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<UploadResult> {
    // 순수 비즈니스 로직만 존재
    // 로깅 코드 없음!
    
    await this.validateFile(file);
    const fileHash = await this.calculateHash(file.buffer);
    
    const seaweedResult = await this.seaweedClient.putObject({
      Key: this.generateStoragePath(file),
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    const document = await this.fileRepository.create({
      uuid: uuidv4(),
      originalName: file.originalname,
      seaweedFid: seaweedResult.fid,
      ownerId: userId,
    });

    return {
      id: document.uuid,
      name: document.originalName,
      size: document.fileSize,
      status: 'processing',
    };
  }

  @Logged({
    operation: '파일 검증',
    category: 'validation',
    featureFlag: 'logging.debug',  // 디버그 모드에서만
  })
  private async validateFile(file: Express.Multer.File): Promise<void> {
    // 검증 로직...
  }
}
```

---

## 6. 장애 격리

### 6.1 Circuit Breaker 패턴

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/infrastructure/logging/circuit-breaker/logging-circuit-breaker.ts
// 로깅 시스템 장애 시 자동 차단
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',     // 정상 상태
  OPEN = 'OPEN',         // 차단 상태 (실패 임계치 초과)
  HALF_OPEN = 'HALF_OPEN', // 복구 테스트 상태
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // 실패 임계치 (기본: 5)
  resetTimeout: number;        // 리셋 타임아웃 (기본: 30초)
  halfOpenRequests: number;    // Half-Open 상태 테스트 요청 수
}

@Injectable()
export class LoggingCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;

  private readonly config: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 30000,  // 30초
    halfOpenRequests: 3,
  };

  /**
   * 로깅 작업을 Circuit Breaker로 감싸서 실행
   */
  async execute<T>(operation: () => Promise<T>): Promise<T | null> {
    // OPEN 상태 체크
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        // 차단 상태 - 로깅 스킵 (비즈니스에 영향 없음)
        return null;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      // ⚠️ 에러를 throw하지 않고 null 반환
      // 로깅 실패가 비즈니스에 영향을 주지 않음
      return null;
    }
  }

  /**
   * 동기 버전 (Fire-and-Forget)
   */
  executeSync(operation: () => void): void {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        return; // 스킵
      }
    }

    try {
      operation();
      this.onSuccess();
    } catch {
      this.onFailure();
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenRequests) {
        this.reset();
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.warn('[CircuitBreaker] Logging circuit OPENED due to failures');
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime.getTime() > this.config.resetTimeout;
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    console.info('[CircuitBreaker] Logging circuit CLOSED (recovered)');
  }

  getState(): CircuitState {
    return this.state;
  }
}
```

### 6.2 Fallback 로깅 전략

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/infrastructure/logging/strategies/logging-strategy-router.ts
// 다중 어댑터 라우팅 및 Fallback 처리
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable } from '@nestjs/common';
import { LoggingCircuitBreaker } from '../circuit-breaker/logging-circuit-breaker';
import { ELKLoggingAdapter } from '../adapters/elk-logging.adapter';
import { FileLoggingAdapter } from '../adapters/file-logging.adapter';
import { NullLoggingAdapter } from '../adapters/null-logging.adapter';
import { FeatureFlagService } from '../../feature-flags/feature-flag.service';

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  traceId: string;
  data?: Record<string, any>;
  timestamp: Date;
}

export interface AuditEntry {
  action: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, any>;
  traceId: string;
  timestamp: Date;
}

@Injectable()
export class LoggingStrategyRouter {
  private readonly adapters: Map<string, any>;

  constructor(
    private readonly circuitBreaker: LoggingCircuitBreaker,
    private readonly elkAdapter: ELKLoggingAdapter,
    private readonly fileAdapter: FileLoggingAdapter,
    private readonly nullAdapter: NullLoggingAdapter,
    private readonly featureFlags: FeatureFlagService,
  ) {
    this.adapters = new Map([
      ['elk', this.elkAdapter],
      ['file', this.fileAdapter],
      ['null', this.nullAdapter],
    ]);
  }

  /**
   * 로그 전송 (Fallback 체인 적용)
   */
  async log(entry: LogEntry): Promise<void> {
    // Feature Flag 체크
    if (!this.featureFlags.isEnabled('logging.enabled')) {
      return;
    }

    // Circuit Breaker를 통한 실행
    await this.circuitBreaker.execute(async () => {
      // Primary: ELK
      if (this.featureFlags.isEnabled('logging.elk')) {
        try {
          await this.elkAdapter.log(entry);
          return;
        } catch (elkError) {
          // ELK 실패 시 Fallback
          console.warn('[LogRouter] ELK failed, falling back to file');
        }
      }

      // Fallback: File
      if (this.featureFlags.isEnabled('logging.file-fallback')) {
        await this.fileAdapter.log(entry);
      }
    });
  }

  /**
   * 감사 로그 (더 안정적으로 처리)
   */
  async audit(entry: AuditEntry): Promise<void> {
    if (!this.featureFlags.isEnabled('logging.audit')) {
      return;
    }

    // 감사 로그는 Circuit Breaker 없이 직접 시도 + Fallback
    try {
      await this.elkAdapter.audit(entry);
    } catch {
      // ELK 실패 시 무조건 파일에 기록 (감사 로그는 유실 방지)
      await this.fileAdapter.audit(entry);
    }
  }

  /**
   * 디버그 로그 (비동기, 무손실)
   */
  debug(data: any): void {
    if (!this.featureFlags.isEnabled('logging.debug')) {
      return;
    }

    // setImmediate로 비동기 처리
    setImmediate(() => {
      try {
        this.fileAdapter.debug(data);
      } catch {
        // 무시
      }
    });
  }

  /**
   * 메트릭 증가 (Fire-and-Forget)
   */
  incrementMetric(metric: string): void {
    setImmediate(() => {
      try {
        // Prometheus/StatsD 등으로 전송
      } catch {
        // 무시
      }
    });
  }
}
```

---

## 7. 런타임 구성

### 7.1 Feature Flag 서비스

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/infrastructure/feature-flags/feature-flag.service.ts
// 런타임 로깅 제어
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LoggingFeatureFlags {
  'logging.enabled': boolean;
  'logging.elk': boolean;
  'logging.file-fallback': boolean;
  'logging.audit': boolean;
  'logging.file-operations': boolean;
  'logging.background-jobs': boolean;
  'logging.api-requests': boolean;
  'logging.debug': boolean;
  'logging.performance': boolean;
}

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private flags: Map<string, boolean> = new Map();
  private refreshInterval: NodeJS.Timer;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.loadFlags();
    
    // 주기적으로 플래그 갱신 (런타임 변경 지원)
    this.refreshInterval = setInterval(
      () => this.loadFlags(),
      60000, // 1분
    );
  }

  /**
   * 플래그 로드 (환경변수, DB, 또는 외부 서비스에서)
   */
  private async loadFlags(): Promise<void> {
    // 환경변수에서 기본값 로드
    const defaults: LoggingFeatureFlags = {
      'logging.enabled': this.configService.get('LOGGING_ENABLED', 'true') === 'true',
      'logging.elk': this.configService.get('LOGGING_ELK_ENABLED', 'true') === 'true',
      'logging.file-fallback': this.configService.get('LOGGING_FILE_FALLBACK', 'true') === 'true',
      'logging.audit': this.configService.get('LOGGING_AUDIT_ENABLED', 'true') === 'true',
      'logging.file-operations': this.configService.get('LOGGING_FILE_OPS', 'true') === 'true',
      'logging.background-jobs': this.configService.get('LOGGING_BG_JOBS', 'true') === 'true',
      'logging.api-requests': this.configService.get('LOGGING_API_REQUESTS', 'true') === 'true',
      'logging.debug': this.configService.get('LOGGING_DEBUG', 'false') === 'true',
      'logging.performance': this.configService.get('LOGGING_PERF', 'true') === 'true',
    };

    // DB나 외부 서비스에서 오버라이드 로드 (선택적)
    // const overrides = await this.loadFromDatabase();
    // const merged = { ...defaults, ...overrides };

    for (const [key, value] of Object.entries(defaults)) {
      this.flags.set(key, value);
    }
  }

  /**
   * 플래그 확인
   */
  isEnabled(flag: keyof LoggingFeatureFlags | string): boolean {
    return this.flags.get(flag) ?? false;
  }

  /**
   * 런타임 플래그 변경 (API로 제어 가능)
   */
  setFlag(flag: string, enabled: boolean): void {
    this.flags.set(flag, enabled);
  }

  /**
   * 모든 플래그 조회
   */
  getAllFlags(): Record<string, boolean> {
    return Object.fromEntries(this.flags);
  }
}
```

### 7.2 런타임 제어 API

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/interfaces/admin/logging-control.controller.ts
// 운영 중 로깅 제어 API
// ═══════════════════════════════════════════════════════════════════════════

import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../../guards/admin.guard';
import { FeatureFlagService } from '../../infrastructure/feature-flags/feature-flag.service';
import { LoggingCircuitBreaker } from '../../infrastructure/logging/circuit-breaker/logging-circuit-breaker';

@ApiTags('Admin - Logging Control')
@Controller('admin/logging')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class LoggingControlController {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly circuitBreaker: LoggingCircuitBreaker,
  ) {}

  /**
   * 현재 로깅 설정 조회
   */
  @Get('status')
  @ApiOperation({ summary: '로깅 상태 조회' })
  getLoggingStatus() {
    return {
      flags: this.featureFlags.getAllFlags(),
      circuitBreaker: {
        state: this.circuitBreaker.getState(),
      },
    };
  }

  /**
   * 로깅 플래그 변경
   */
  @Post('flags')
  @ApiOperation({ summary: '로깅 플래그 변경' })
  updateFlags(@Body() updates: Record<string, boolean>) {
    for (const [flag, enabled] of Object.entries(updates)) {
      this.featureFlags.setFlag(flag, enabled);
    }
    return { updated: updates, current: this.featureFlags.getAllFlags() };
  }

  /**
   * 특정 로깅 기능 비활성화 (긴급 상황)
   */
  @Post('disable-all')
  @ApiOperation({ summary: '모든 로깅 비활성화 (긴급)' })
  disableAllLogging() {
    this.featureFlags.setFlag('logging.enabled', false);
    return { message: '모든 로깅이 비활성화되었습니다.' };
  }

  /**
   * 로깅 재활성화
   */
  @Post('enable-all')
  @ApiOperation({ summary: '로깅 재활성화' })
  enableAllLogging() {
    this.featureFlags.setFlag('logging.enabled', true);
    return { message: '로깅이 재활성화되었습니다.' };
  }
}
```

### 7.3 환경 변수 설정

```env
# ═══════════════════════════════════════════════════════════════════════════
# 로깅 Feature Flags
# 모든 설정을 런타임에 변경 가능
# ═══════════════════════════════════════════════════════════════════════════

# 마스터 스위치
LOGGING_ENABLED=true

# ELK 로깅
LOGGING_ELK_ENABLED=true

# 파일 Fallback (ELK 장애 시)
LOGGING_FILE_FALLBACK=true

# 감사 로깅
LOGGING_AUDIT_ENABLED=true

# 파일 작업 로깅
LOGGING_FILE_OPS=true

# 백그라운드 작업 로깅
LOGGING_BG_JOBS=true

# API 요청 로깅
LOGGING_API_REQUESTS=true

# 디버그 로깅 (개발/테스트용)
LOGGING_DEBUG=false

# 성능 메트릭 로깅
LOGGING_PERF=true

# ═══════════════════════════════════════════════════════════════════════════
# Circuit Breaker 설정
# ═══════════════════════════════════════════════════════════════════════════
CIRCUIT_FAILURE_THRESHOLD=5
CIRCUIT_RESET_TIMEOUT=30000
```

---

## 8. 구현 가이드

### 8.1 모듈 구조

```
src/
├── domain/
│   └── events/
│       ├── file.events.ts          # 도메인 이벤트 정의
│       ├── system.events.ts        # 시스템 이벤트 정의
│       └── index.ts
│
├── business/                        # 비즈니스 로직 (로깅 없음!)
│   ├── file-upload/
│   │   └── file-upload.service.ts  # EventEmitter만 사용
│   ├── file-download/
│   └── search/
│
├── infrastructure/
│   ├── logging/                     # 로깅 인프라 (분리됨)
│   │   ├── logging.module.ts
│   │   │
│   │   ├── handlers/               # 이벤트 핸들러
│   │   │   ├── file-event.handler.ts
│   │   │   ├── system-event.handler.ts
│   │   │   └── api-event.handler.ts
│   │   │
│   │   ├── adapters/               # 로깅 어댑터
│   │   │   ├── elk-logging.adapter.ts
│   │   │   ├── file-logging.adapter.ts
│   │   │   └── null-logging.adapter.ts
│   │   │
│   │   ├── strategies/             # 라우팅 전략
│   │   │   └── logging-strategy-router.ts
│   │   │
│   │   ├── circuit-breaker/        # 장애 격리
│   │   │   └── logging-circuit-breaker.ts
│   │   │
│   │   ├── decorators/             # AOP 데코레이터
│   │   │   └── logged.decorator.ts
│   │   │
│   │   └── interceptors/           # 인터셉터
│   │       └── logging.interceptor.ts
│   │
│   └── feature-flags/              # Feature Flag
│       └── feature-flag.service.ts
│
└── interfaces/
    └── admin/
        └── logging-control.controller.ts  # 런타임 제어 API
```

### 8.2 모듈 설정

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/infrastructure/logging/logging.module.ts
// 로깅 모듈 - 비즈니스 모듈과 완전 분리
// ═══════════════════════════════════════════════════════════════════════════

import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Handlers
import { FileEventLoggingHandler } from './handlers/file-event.handler';
import { SystemEventLoggingHandler } from './handlers/system-event.handler';
import { ApiEventLoggingHandler } from './handlers/api-event.handler';

// Adapters
import { ELKLoggingAdapter } from './adapters/elk-logging.adapter';
import { FileLoggingAdapter } from './adapters/file-logging.adapter';
import { NullLoggingAdapter } from './adapters/null-logging.adapter';

// Core
import { LoggingStrategyRouter } from './strategies/logging-strategy-router';
import { LoggingCircuitBreaker } from './circuit-breaker/logging-circuit-breaker';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

// Feature Flags
import { FeatureFlagService } from '../feature-flags/feature-flag.service';

@Global()  // 전역 모듈로 등록 (옵션)
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,           // 와일드카드 이벤트 지원
      delimiter: '.',           // 이벤트 네임스페이스 구분자
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: true,       // ⚠️ 이벤트 핸들러 에러 무시
    }),
  ],
  providers: [
    // Feature Flags
    FeatureFlagService,
    
    // Circuit Breaker
    LoggingCircuitBreaker,
    
    // Adapters
    ELKLoggingAdapter,
    FileLoggingAdapter,
    NullLoggingAdapter,
    
    // Router
    LoggingStrategyRouter,
    
    // Event Handlers
    FileEventLoggingHandler,
    SystemEventLoggingHandler,
    ApiEventLoggingHandler,
    
    // Interceptor
    LoggingInterceptor,
  ],
  exports: [
    FeatureFlagService,
    LoggingStrategyRouter,
    LoggingCircuitBreaker,
    LoggingInterceptor,
  ],
})
export class LoggingModule {}
```

### 8.3 비즈니스 모듈 (로깅 의존성 없음)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// src/business/file-upload/file-upload.module.ts
// 비즈니스 모듈 - LoggingModule import 없음!
// ═══════════════════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { FileUploadService } from './file-upload.service';
// ❌ import { LoggingModule } from '...'; // 로깅 모듈 import 없음!

@Module({
  imports: [
    // EventEmitterModule은 AppModule에서 이미 로드됨
    // LoggingModule 필요 없음
  ],
  providers: [FileUploadService],
  exports: [FileUploadService],
})
export class FileUploadModule {}
```

---

## 9. 테스트 전략

### 9.1 비즈니스 로직 단위 테스트 (로깅 무관)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// test/business/file-upload/file-upload.service.spec.ts
// 비즈니스 로직 테스트 - 로거 모킹 불필요!
// ═══════════════════════════════════════════════════════════════════════════

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileUploadService } from './file-upload.service';

describe('FileUploadService', () => {
  let service: FileUploadService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: SeaweedS3Client,
          useValue: {
            putObject: jest.fn().mockResolvedValue({ fid: 'test-fid' }),
          },
        },
        {
          provide: FileDocumentRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({ uuid: 'test-uuid' }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),  // 이벤트 발행만 확인
          },
        },
        // ❌ Logger 모킹 불필요!
        // ❌ ELKLogger 모킹 불필요!
      ],
    }).compile();

    service = module.get<FileUploadService>(FileUploadService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('uploadFile', () => {
    it('파일 업로드 성공 시 FileUploadedEvent를 발행해야 한다', async () => {
      // Given
      const mockFile = createMockFile();
      
      // When
      const result = await service.uploadFile(mockFile, 'user-123', 'trace-123');

      // Then
      expect(result.id).toBe('test-uuid');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'file.uploaded',
        expect.objectContaining({
          fileId: 'test-uuid',
          userId: 'user-123',
          traceId: 'trace-123',
        }),
      );
    });

    it('업로드 실패 시 ErrorOccurredEvent를 발행해야 한다', async () => {
      // Given
      const mockFile = createMockFile();
      jest.spyOn(service['seaweedClient'], 'putObject')
        .mockRejectedValue(new Error('Storage error'));

      // When & Then
      await expect(service.uploadFile(mockFile, 'user-123', 'trace-123'))
        .rejects.toThrow('Storage error');
      
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'system.error',
        expect.objectContaining({
          errorCode: 'FILE_UPLOAD_FAILED',
        }),
      );
    });
  });
});
```

### 9.2 로깅 핸들러 테스트 (분리)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// test/infrastructure/logging/handlers/file-event.handler.spec.ts
// 로깅 핸들러 테스트 - 비즈니스 로직과 분리
// ═══════════════════════════════════════════════════════════════════════════

import { Test, TestingModule } from '@nestjs/testing';
import { FileEventLoggingHandler } from './file-event.handler';
import { LoggingStrategyRouter } from '../strategies/logging-strategy-router';
import { FeatureFlagService } from '../../feature-flags/feature-flag.service';
import { FileUploadedEvent } from '../../../domain/events/file.events';

describe('FileEventLoggingHandler', () => {
  let handler: FileEventLoggingHandler;
  let loggingRouter: jest.Mocked<LoggingStrategyRouter>;
  let featureFlags: jest.Mocked<FeatureFlagService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileEventLoggingHandler,
        {
          provide: LoggingStrategyRouter,
          useValue: {
            log: jest.fn(),
            audit: jest.fn(),
          },
        },
        {
          provide: FeatureFlagService,
          useValue: {
            isEnabled: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<FileEventLoggingHandler>(FileEventLoggingHandler);
    loggingRouter = module.get(LoggingStrategyRouter);
    featureFlags = module.get(FeatureFlagService);
  });

  describe('handleFileUploaded', () => {
    const event = new FileUploadedEvent(
      'trace-123',
      'file-456',
      'test.pdf',
      1024,
      'application/pdf',
      'user-789',
      150,
      'seaweedfs',
    );

    it('Feature Flag가 활성화되면 로그를 기록해야 한다', async () => {
      // Given
      featureFlags.isEnabled.mockReturnValue(true);

      // When
      await handler.handleFileUploaded(event);

      // Then
      expect(loggingRouter.log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          category: 'file-operation',
          traceId: 'trace-123',
        }),
      );
    });

    it('Feature Flag가 비활성화되면 로그를 기록하지 않아야 한다', async () => {
      // Given
      featureFlags.isEnabled.mockReturnValue(false);

      // When
      await handler.handleFileUploaded(event);

      // Then
      expect(loggingRouter.log).not.toHaveBeenCalled();
    });

    it('로깅 실패해도 예외를 발생시키지 않아야 한다', async () => {
      // Given
      featureFlags.isEnabled.mockReturnValue(true);
      loggingRouter.log.mockRejectedValue(new Error('ELK connection failed'));

      // When & Then - 에러 없이 완료
      await expect(handler.handleFileUploaded(event)).resolves.not.toThrow();
    });
  });
});
```

---

## 10. 비교 요약

### 10.1 Before vs After

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        결합 방식 비교                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ❌ Before (긴밀한 결합)            ✅ After (느슨한 결합)                  │
│  ════════════════════════           ════════════════════════                │
│                                                                             │
│  • Logger 직접 주입                 • EventEmitter만 사용                  │
│  • try-catch에 로깅 포함            • 이벤트 발행만 (Fire-and-Forget)       │
│  • 로깅 실패 → 비즈니스 영향        • 로깅 실패 → 무영향                   │
│  • 테스트 시 로거 모킹 필수         • 로거 모킹 불필요                      │
│  • ELK 변경 → 전체 코드 수정        • 어댑터만 교체                        │
│  • 런타임 제어 불가                 • Feature Flag로 동적 제어             │
│                                                                             │
│  ┌────────────────────────┐         ┌────────────────────────┐              │
│  │ FileUploadService      │         │ FileUploadService      │              │
│  │                        │         │                        │              │
│  │ - logger               │         │ - eventEmitter         │              │
│  │ - elkLogger            │         │                        │              │
│  │ - auditLogger          │         │ // 순수 비즈니스 로직  │              │
│  │                        │         │ // 로깅 코드 없음      │              │
│  │ // 로깅 코드 산재      │         │                        │              │
│  └────────────────────────┘         └────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 장단점

| 항목 | 긴밀한 결합 | 느슨한 결합 |
|------|------------|------------|
| **구현 복잡도** | 낮음 | 중간 (이벤트 시스템 필요) |
| **유지보수** | 어려움 | 쉬움 |
| **테스트** | 어려움 (모킹 다수) | 쉬움 (이벤트만 확인) |
| **장애 영향** | 비즈니스에 전파 | 격리됨 |
| **유연성** | 낮음 | 높음 |
| **런타임 제어** | 불가 | Feature Flag |
| **성능** | 동기 로깅 시 저하 | 비동기 처리 |
| **코드 가독성** | 로깅 코드 산재 | 비즈니스 로직만 |

---

## 📝 결론

**느슨한 결합 로깅 아키텍처**를 통해:

1. ✅ **비즈니스 로직 보호**: 로깅 장애가 서비스에 영향 없음
2. ✅ **유연한 교체**: ELK → Datadog 등 쉽게 변경 가능
3. ✅ **런타임 제어**: Feature Flag로 동적 활성화/비활성화
4. ✅ **테스트 용이**: 로거 모킹 불필요
5. ✅ **코드 품질**: 비즈니스 로직에서 로깅 코드 분리

이 아키텍처는 **파일 업로드 7단계**, **다운로드 Fallback**, **백그라운드 동기화** 등 복잡한 프로세스에서도 로깅 시스템이 비즈니스 로직에 영향을 주지 않도록 보장합니다.

---

*이 문서는 통합 파일 시스템의 느슨한 결합 로깅 아키텍처를 정의합니다.*
