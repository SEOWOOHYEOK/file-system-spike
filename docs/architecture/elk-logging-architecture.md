# ELK Stack 기반 통합 로깅 아키텍처

> 단일 Elasticsearch 클러스터에서 검색 + 로그를 통합 관리하는 로깅 시스템

---

## 📋 목차

1. [설계 원칙](#1-설계-원칙)
2. [로그 유형 분류](#2-로그-유형-분류)
3. [아키텍처 구조](#3-아키텍처-구조)
4. [인덱스 설계](#4-인덱스-설계)
5. [로그 포맷 표준](#5-로그-포맷-표준)
6. [구현 상세](#6-구현-상세)
7. [Docker 설정](#7-docker-설정)
8. [ILM 정책](#8-ilm-정책)
9. [모니터링 및 알림](#9-모니터링-및-알림)
10. [구현 로드맵](#10-구현-로드맵)

---

## 1. 설계 원칙

### 1.1 단일 ES 클러스터 통합 방식

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         설계 결정: 단일 ES 방식                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✅ 채택: 하나의 Elasticsearch 클러스터                                     │
│  ─────────────────────────────────────────                                  │
│  • 검색용 인덱스 (file_documents) + 로그용 인덱스 (*-logs-*)               │
│  • ILM으로 로그 자동 순환 삭제                                             │
│  • 관리 복잡도 최소화                                                       │
│                                                                             │
│  ❌ 기각: 별도 ES 클러스터                                                  │
│  ─────────────────────────────────────────                                  │
│  • 관리 대상 증가                                                           │
│  • 소규모~중규모에서는 과잉 설계                                           │
│  • 추후 필요시 분리 가능                                                    │
│                                                                             │
│  📊 분리 검토 기준                                                          │
│  ─────────────────────────────────────────                                  │
│  • 로그 용량이 검색 데이터의 10배 초과 시                                   │
│  • 검색 응답 시간이 500ms 초과 지속 시                                     │
│  • ES 힙 메모리 85% 이상 지속 시                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 ELK Stack 구성요소

| 컴포넌트 | 역할 | 포트 |
|----------|------|------|
| **Elasticsearch** | 로그 저장 및 검색 | 9200 |
| **Logstash** | 로그 파싱, 필터링, 라우팅 | 5044 |
| **Filebeat** | 로그 파일 수집 및 전송 | - |
| **Kibana** | 시각화 및 대시보드 | 5601 |

---

## 2. 로그 유형 분류

### 2.1 7개 로그 카테고리

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           로그 카테고리 분류                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  📁 File Operation (파일 작업)                                              │
│  ─────────────────────────────                                              │
│  • 업로드, 다운로드, 삭제, 이동, 복사                                       │
│  • NAS 동기화, 캐시 제거                                                    │
│  • Tika 분석, ES 색인                                                       │
│  • traceId로 전체 생명주기 추적                                             │
│  • 보관: 90일                                                               │
│                                                                             │
│  🌐 API Request (HTTP 요청)                                                 │
│  ─────────────────────────────                                              │
│  • 요청/응답 로그                                                           │
│  • 상태 코드, 응답 시간                                                     │
│  • 클라이언트 정보 (IP, User-Agent)                                        │
│  • 보관: 14일                                                               │
│                                                                             │
│  ⚙️ Background Job (백그라운드 작업)                                        │
│  ─────────────────────────────                                              │
│  • Sync Worker, Tika Worker, Index Worker                                  │
│  • 작업 시작/완료/실패                                                      │
│  • 재시도 횟수, 큐 상태                                                     │
│  • 보관: 30일                                                               │
│                                                                             │
│  🏗️ Infrastructure (인프라)                                                 │
│  ─────────────────────────────                                              │
│  • SeaweedFS, NAS, PostgreSQL, Redis 상태                                  │
│  • 연결 실패, 타임아웃                                                      │
│  • 헬스 체크 결과                                                           │
│  • 보관: 30일                                                               │
│                                                                             │
│  📋 Audit (감사)                                                            │
│  ─────────────────────────────                                              │
│  • 사용자 행동 기록                                                         │
│  • 파일 접근, 권한 변경                                                     │
│  • 관리자 작업                                                              │
│  • 보관: 1년 (PostgreSQL 동시 저장)                                        │
│                                                                             │
│  🔒 Security (보안)                                                         │
│  ─────────────────────────────                                              │
│  • 로그인 시도, 인증 실패                                                   │
│  • 권한 거부, 의심스러운 활동                                               │
│  • Path Traversal 시도                                                     │
│  • 보관: 180일                                                              │
│                                                                             │
│  📊 Performance (성능)                                                      │
│  ─────────────────────────────                                              │
│  • 응답 시간, 처리량                                                        │
│  • 리소스 사용량                                                            │
│  • 느린 쿼리, 병목 지점                                                     │
│  • 보관: 7일                                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 카테고리별 상세

| 카테고리 | 인덱스 패턴 | 보관 | ILM 정책 |
|----------|-------------|------|----------|
| File Operation | `fileserver-file-ops-*` | 90일 | logs-file-ops-policy |
| API Request | `fileserver-api-*` | 14일 | logs-api-policy |
| Background Job | `fileserver-jobs-*` | 30일 | logs-standard-policy |
| Infrastructure | `fileserver-infra-*` | 30일 | logs-standard-policy |
| Audit | `fileserver-audit-*` | 1년 | logs-audit-policy |
| Security | `fileserver-security-*` | 180일 | logs-security-policy |
| Performance | `fileserver-perf-*` | 7일 | logs-perf-policy |

---

## 3. 아키텍처 구조

### 3.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           로깅 아키텍처 전체 구조                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │   NestJS App        │
                              │   (fileserver)      │
                              └──────────┬──────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
    ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
    │   API Layer     │       │ Business Layer  │       │Background Worker│
    │                 │       │                 │       │                 │
    │ HTTP Interceptor│       │ FileService     │       │ SyncWorker      │
    │ Auth Guard      │       │ FolderService   │       │ TikaWorker      │
    └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
             │                         │                         │
             └─────────────────────────┼─────────────────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────┐
                          │    Winston Logger       │
                          │    (JSON Format)        │
                          └─────────────┬───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
            │ Console     │     │ File        │     │ ES Direct   │
            │ (Dev only)  │     │ ./logs/*.log│     │ (Optional)  │
            └─────────────┘     └──────┬──────┘     └─────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │    Filebeat     │
                              │  (로그 수집)    │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │    Logstash     │
                              │ (파싱/필터링)   │
                              └────────┬────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Elasticsearch (통합 클러스터)                            │
│                                                                              │
│  ┌────────────────────────────┐    ┌────────────────────────────────────┐   │
│  │   검색 인덱스 (영구)       │    │      로그 인덱스 (ILM 관리)        │   │
│  │                            │    │                                    │   │
│  │  • file_documents          │    │  • fileserver-file-ops-2026.01.12 │   │
│  │  • file_chunks (LLM용)     │    │  • fileserver-api-2026.01.12      │   │
│  │                            │    │  • fileserver-jobs-2026.01.12     │   │
│  │                            │    │  • fileserver-audit-2026.01       │   │
│  │                            │    │  • ...                            │   │
│  └────────────────────────────┘    └────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │     Kibana      │
                              │   (대시보드)    │
                              └─────────────────┘
```

### 3.2 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            로그 데이터 흐름                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 로그 생성 (NestJS)                                                      │
│  ─────────────────────                                                      │
│  logger.log({ category: 'file-operation', traceId: 'xxx', ... })           │
│                                                                             │
│  2. 파일 저장 (Winston)                                                     │
│  ─────────────────────                                                      │
│  ./logs/fileserver-2026-01-12.log (JSON Lines)                             │
│                                                                             │
│  3. 수집 (Filebeat)                                                         │
│  ─────────────────────                                                      │
│  • 파일 변경 감지                                                           │
│  • 멀티라인 처리                                                            │
│  • Logstash로 전송                                                         │
│                                                                             │
│  4. 파싱/라우팅 (Logstash)                                                  │
│  ─────────────────────                                                      │
│  • JSON 파싱                                                                │
│  • category별 인덱스 라우팅                                                │
│  • 필드 정규화                                                              │
│                                                                             │
│  5. 저장 (Elasticsearch)                                                    │
│  ─────────────────────                                                      │
│  • 인덱스 템플릿 적용                                                       │
│  • ILM 정책 자동 적용                                                       │
│                                                                             │
│  6. 시각화 (Kibana)                                                         │
│  ─────────────────────                                                      │
│  • 대시보드                                                                 │
│  • 알림                                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 인덱스 설계

### 4.1 통합 클러스터 인덱스 구조

```
Elasticsearch 클러스터 (localhost:9200)
│
├── 검색 인덱스 (Alias 사용)
│   ├── file_documents                    # 문서 메타데이터
│   │   └── Alias: file-search
│   └── document_chunks                   # LLM 청크 (향후)
│       └── Alias: chunks-search
│
├── 로그 인덱스 (날짜별 롤오버)
│   │
│   ├── fileserver-file-ops-*             # 파일 작업 로그
│   │   ├── fileserver-file-ops-2026.01.12
│   │   ├── fileserver-file-ops-2026.01.13
│   │   └── Alias: fileserver-file-ops    # 현재 쓰기용
│   │
│   ├── fileserver-api-*                  # API 요청 로그
│   │   └── Alias: fileserver-api
│   │
│   ├── fileserver-jobs-*                 # 백그라운드 작업
│   │   └── Alias: fileserver-jobs
│   │
│   ├── fileserver-infra-*                # 인프라 로그
│   │   └── Alias: fileserver-infra
│   │
│   ├── fileserver-audit-*                # 감사 로그 (월별)
│   │   ├── fileserver-audit-2026.01
│   │   └── Alias: fileserver-audit
│   │
│   ├── fileserver-security-*             # 보안 로그
│   │   └── Alias: fileserver-security
│   │
│   └── fileserver-perf-*                 # 성능 로그
│       └── Alias: fileserver-perf
│
└── 시스템 인덱스
    ├── .kibana*                          # Kibana 설정
    └── ilm-history-*                     # ILM 이력
```

### 4.2 인덱스 템플릿

```json
// PUT _index_template/fileserver-logs-template
{
  "index_patterns": ["fileserver-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "refresh_interval": "5s",
      "index.lifecycle.name": "logs-standard-policy",
      "index.lifecycle.rollover_alias": "fileserver-logs"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "category": { "type": "keyword" },
        "service": { "type": "keyword" },
        "traceId": { "type": "keyword" },
        "spanId": { "type": "keyword" },
        "userId": { "type": "keyword" },
        "message": { "type": "text" },
        "error": {
          "properties": {
            "code": { "type": "keyword" },
            "message": { "type": "text" },
            "stack": { "type": "text" }
          }
        },
        "metadata": { "type": "object", "enabled": false },
        "duration": { "type": "integer" },
        "http": {
          "properties": {
            "method": { "type": "keyword" },
            "path": { "type": "keyword" },
            "statusCode": { "type": "integer" },
            "userAgent": { "type": "keyword" },
            "ip": { "type": "ip" }
          }
        },
        "file": {
          "properties": {
            "id": { "type": "keyword" },
            "name": { "type": "keyword" },
            "size": { "type": "long" },
            "mimeType": { "type": "keyword" }
          }
        },
        "storage": {
          "properties": {
            "seaweedStatus": { "type": "keyword" },
            "nasStatus": { "type": "keyword" },
            "esStatus": { "type": "keyword" }
          }
        }
      }
    }
  },
  "priority": 100
}
```

---

## 5. 로그 포맷 표준

### 5.1 기본 로그 구조

```typescript
// 기본 로그 인터페이스
interface BaseLog {
  // 필수 필드
  '@timestamp': string;          // ISO 8601 (2026-01-12T10:30:00.000Z)
  level: LogLevel;               // debug | info | warn | error | critical
  category: LogCategory;         // 7개 카테고리 중 하나
  service: string;               // fileserver-api | fileserver-worker
  message: string;               // 로그 메시지
  
  // 추적 필드
  traceId?: string;              // 분산 추적 ID (파일 작업 전체 추적)
  spanId?: string;               // 현재 단계 ID
  parentSpanId?: string;         // 부모 단계 ID
  
  // 컨텍스트
  userId?: string;               // 사용자 ID
  sessionId?: string;            // 세션 ID
  
  // 추가 데이터
  metadata?: Record<string, any>;// 카테고리별 추가 데이터
  duration?: number;             // 처리 시간 (ms)
  
  // 에러 정보
  error?: {
    code: string;
    message: string;
    stack?: string;
    retryable?: boolean;
  };
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

type LogCategory = 
  | 'file-operation'
  | 'api-request'
  | 'background-job'
  | 'infrastructure'
  | 'audit'
  | 'security'
  | 'performance';
```

### 5.2 카테고리별 확장 필드

```typescript
// 파일 작업 로그
interface FileOperationLog extends BaseLog {
  category: 'file-operation';
  file?: {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    hash?: string;
  };
  operation: 'upload' | 'download' | 'delete' | 'move' | 'sync' | 'index';
  stage: 'started' | 'processing' | 'completed' | 'failed';
  storage?: {
    seaweedStatus: string;
    nasStatus: string;
    esStatus: string;
    tikaStatus: string;
  };
}

// API 요청 로그
interface ApiRequestLog extends BaseLog {
  category: 'api-request';
  http: {
    method: string;
    path: string;
    query?: Record<string, any>;
    statusCode: number;
    userAgent?: string;
    ip: string;
    contentLength?: number;
  };
  responseTime: number;
}

// 감사 로그
interface AuditLog extends BaseLog {
  category: 'audit';
  action: string;              // FILE_UPLOADED, FILE_DELETED, etc.
  target: {
    type: 'file' | 'folder' | 'user' | 'permission';
    id: string;
    name?: string;
  };
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  result: 'success' | 'failure';
}

// 보안 로그
interface SecurityLog extends BaseLog {
  category: 'security';
  event: 'login_attempt' | 'auth_failure' | 'permission_denied' | 'suspicious_activity';
  threat?: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: string;
  };
  source: {
    ip: string;
    userAgent?: string;
    country?: string;
  };
}
```

### 5.3 로그 예시

```json
// 파일 업로드 시작 로그
{
  "@timestamp": "2026-01-12T10:30:00.123Z",
  "level": "info",
  "category": "file-operation",
  "service": "fileserver-api",
  "traceId": "file-op-abc123",
  "spanId": "span-001",
  "userId": "user-456",
  "message": "파일 업로드 시작",
  "operation": "upload",
  "stage": "started",
  "file": {
    "name": "report.pdf",
    "size": 1048576,
    "mimeType": "application/pdf"
  }
}

// API 요청 로그
{
  "@timestamp": "2026-01-12T10:30:00.500Z",
  "level": "info",
  "category": "api-request",
  "service": "fileserver-api",
  "traceId": "req-xyz789",
  "userId": "user-456",
  "message": "POST /api/files completed",
  "http": {
    "method": "POST",
    "path": "/api/files",
    "statusCode": 201,
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  },
  "responseTime": 245
}

// 에러 로그
{
  "@timestamp": "2026-01-12T10:30:05.000Z",
  "level": "error",
  "category": "infrastructure",
  "service": "fileserver-worker",
  "traceId": "file-op-abc123",
  "message": "NAS 동기화 실패",
  "error": {
    "code": "NAS_CONNECTION_FAILED",
    "message": "Network path not found",
    "stack": "Error: Network path not found\n    at ...",
    "retryable": true
  },
  "metadata": {
    "nasPath": "\\\\192.168.10.249\\Web\\storage",
    "retryCount": 2,
    "maxRetries": 3
  }
}
```

---

## 6. 구현 상세

### 6.1 폴더 구조

```
appServer/src/
├── common/
│   └── logging/
│       ├── logging.module.ts              # 로깅 모듈
│       ├── services/
│       │   ├── logger.service.ts          # 통합 로거 서비스
│       │   ├── file-operation-logger.ts   # 파일 작업 로거
│       │   ├── audit-logger.ts            # 감사 로거
│       │   └── security-logger.ts         # 보안 로거
│       ├── decorators/
│       │   ├── log-operation.decorator.ts # 메서드 로깅 데코레이터
│       │   └── audit-action.decorator.ts  # 감사 액션 데코레이터
│       ├── interceptors/
│       │   ├── http-logging.interceptor.ts
│       │   └── performance.interceptor.ts
│       ├── interfaces/
│       │   └── log-types.interface.ts     # 타입 정의
│       └── middleware/
│           └── trace-id.middleware.ts     # traceId 생성
```

### 6.2 Logger Service 구현

```typescript
// common/logging/services/logger.service.ts
import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        // 콘솔 출력 (개발용)
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        // 일별 로테이션 파일
        new DailyRotateFile({
          dirname: './logs',
          filename: 'fileserver-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '100m',
          maxFiles: '14d',
          format: winston.format.json(),
        }),
      ],
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  // 구조화된 로그
  logStructured(log: Partial<BaseLog>) {
    const enrichedLog = {
      '@timestamp': new Date().toISOString(),
      service: 'fileserver-api',
      ...log,
    };
    this.logger.log(log.level || 'info', log.message || '', enrichedLog);
  }
}
```

### 6.3 File Operation Logger

```typescript
// common/logging/services/file-operation-logger.ts
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from './logger.service';

export interface FileOperationContext {
  traceId: string;
  userId: string;
  operation: string;
  startTime: number;
  spans: string[];
}

@Injectable()
export class FileOperationLogger {
  constructor(private readonly logger: LoggerService) {}

  // 새 파일 작업 추적 시작
  createTrace(userId: string, operation: string): FileOperationContext {
    const traceId = `file-op-${uuidv4().slice(0, 8)}`;
    
    this.logger.logStructured({
      level: 'info',
      category: 'file-operation',
      traceId,
      userId,
      message: `${operation} 작업 시작`,
      metadata: { operation, stage: 'started' },
    });

    return {
      traceId,
      userId,
      operation,
      startTime: Date.now(),
      spans: [],
    };
  }

  // 단계별 로그
  logSpan(
    ctx: FileOperationContext,
    stage: string,
    data: Record<string, any> = {},
  ): string {
    const spanId = `span-${uuidv4().slice(0, 8)}`;
    
    this.logger.logStructured({
      level: 'info',
      category: 'file-operation',
      traceId: ctx.traceId,
      spanId,
      parentSpanId: ctx.spans[ctx.spans.length - 1],
      userId: ctx.userId,
      message: `${ctx.operation} - ${stage}`,
      metadata: { stage, ...data },
      duration: Date.now() - ctx.startTime,
    });

    ctx.spans.push(spanId);
    return spanId;
  }

  // 에러 로그
  logError(
    ctx: FileOperationContext,
    error: Error,
    options: { code: string; retryable?: boolean },
  ): void {
    this.logger.logStructured({
      level: 'error',
      category: 'file-operation',
      traceId: ctx.traceId,
      userId: ctx.userId,
      message: `${ctx.operation} 실패: ${error.message}`,
      error: {
        code: options.code,
        message: error.message,
        stack: error.stack,
        retryable: options.retryable ?? false,
      },
      duration: Date.now() - ctx.startTime,
    });
  }

  // 완료 로그
  logComplete(ctx: FileOperationContext, result: Record<string, any> = {}): void {
    this.logger.logStructured({
      level: 'info',
      category: 'file-operation',
      traceId: ctx.traceId,
      userId: ctx.userId,
      message: `${ctx.operation} 완료`,
      metadata: { stage: 'completed', ...result },
      duration: Date.now() - ctx.startTime,
    });
  }
}
```

### 6.4 HTTP Logging Interceptor

```typescript
// common/logging/interceptors/http-logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerService } from '../services/logger.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const startTime = Date.now();
    const traceId = request.headers['x-trace-id'] || `req-${Date.now()}`;

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const responseTime = Date.now() - startTime;

          this.logger.logStructured({
            level: 'info',
            category: 'api-request',
            traceId,
            userId: request.user?.id,
            message: `${method} ${url} ${response.statusCode}`,
            http: {
              method,
              path: url,
              statusCode: response.statusCode,
              ip,
              userAgent,
            },
            duration: responseTime,
          });
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;

          this.logger.logStructured({
            level: 'error',
            category: 'api-request',
            traceId,
            userId: request.user?.id,
            message: `${method} ${url} ${error.status || 500}`,
            http: {
              method,
              path: url,
              statusCode: error.status || 500,
              ip,
              userAgent,
            },
            error: {
              code: error.code || 'INTERNAL_ERROR',
              message: error.message,
              stack: error.stack,
            },
            duration: responseTime,
          });
        },
      }),
    );
  }
}
```

---

## 7. Docker 설정

### 7.1 docker-compose.yml 추가

```yaml
  # ============================================================
  # Elasticsearch (통합 - 검색 + 로그)
  # ============================================================
  elasticsearch:
    image: elasticsearch:8.11.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.ilm.enabled=true
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    networks:
      - fileserver-net
    healthcheck:
      test: ["CMD-SHELL", "curl -s http://localhost:9200/_cluster/health | grep -q 'green\\|yellow'"]
      interval: 30s
      timeout: 10s
      retries: 5

  # ============================================================
  # Logstash - 로그 파싱 및 라우팅
  # ============================================================
  logstash:
    image: logstash:8.11.0
    container_name: logstash
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline:ro
      - ./logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
      - ./logs:/var/log/fileserver:ro
    environment:
      - "LS_JAVA_OPTS=-Xmx256m -Xms256m"
    ports:
      - "5044:5044"
      - "9600:9600"
    networks:
      - fileserver-net
    depends_on:
      elasticsearch:
        condition: service_healthy

  # ============================================================
  # Filebeat - 로그 파일 수집
  # ============================================================
  filebeat:
    image: elastic/filebeat:8.11.0
    container_name: filebeat
    user: root
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - ./logs:/var/log/fileserver:ro
    command: filebeat -e -strict.perms=false
    networks:
      - fileserver-net
    depends_on:
      - logstash

  # ============================================================
  # Kibana - 시각화
  # ============================================================
  kibana:
    image: kibana:8.11.0
    container_name: kibana
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    networks:
      - fileserver-net
    depends_on:
      elasticsearch:
        condition: service_healthy

volumes:
  elasticsearch-data:
```

### 7.2 Filebeat 설정

```yaml
# filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/fileserver/*.log
    json.keys_under_root: true
    json.add_error_key: true
    json.message_key: message

processors:
  - add_host_metadata: ~
  - add_docker_metadata: ~

output.logstash:
  hosts: ["logstash:5044"]

logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
  permissions: 0640
```

### 7.3 Logstash 파이프라인

```ruby
# logstash/pipeline/main.conf
input {
  beats {
    port => 5044
  }
}

filter {
  # JSON 파싱
  json {
    source => "message"
    skip_on_invalid_json => true
  }

  # 타임스탬프 파싱
  date {
    match => ["@timestamp", "ISO8601"]
    target => "@timestamp"
  }

  # 카테고리별 필드 정리
  if [category] == "api-request" {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-api" }
    }
  } else if [category] == "file-operation" {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-file-ops" }
    }
  } else if [category] == "audit" {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-audit" }
    }
  } else if [category] == "security" {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-security" }
    }
  } else if [category] == "background-job" {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-jobs" }
    }
  } else if [category] == "infrastructure" {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-infra" }
    }
  } else if [category] == "performance" {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-perf" }
    }
  } else {
    mutate {
      add_field => { "[@metadata][index]" => "fileserver-misc" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "%{[@metadata][index]}-%{+YYYY.MM.dd}"
    ilm_enabled => true
    ilm_rollover_alias => "%{[@metadata][index]}"
    ilm_pattern => "{now/d}-000001"
    ilm_policy => "logs-standard-policy"
  }
}
```

---

## 8. ILM 정책

### 8.1 정책 생성 스크립트

```bash
# scripts/setup-ilm.sh

# 표준 로그 정책 (30일 보관)
curl -X PUT "localhost:9200/_ilm/policy/logs-standard-policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "1d",
            "max_primary_shard_size": "5gb"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": { "delete": {} }
      }
    }
  }
}'

# 파일 작업 로그 정책 (90일 보관)
curl -X PUT "localhost:9200/_ilm/policy/logs-file-ops-policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_age": "1d", "max_primary_shard_size": "10gb" }
        }
      },
      "warm": {
        "min_age": "14d",
        "actions": { "forcemerge": { "max_num_segments": 1 } }
      },
      "delete": {
        "min_age": "90d",
        "actions": { "delete": {} }
      }
    }
  }
}'

# 감사 로그 정책 (1년 보관)
curl -X PUT "localhost:9200/_ilm/policy/logs-audit-policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_age": "30d", "max_primary_shard_size": "10gb" }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": { "forcemerge": { "max_num_segments": 1 } }
      },
      "cold": {
        "min_age": "180d",
        "actions": {}
      },
      "delete": {
        "min_age": "365d",
        "actions": { "delete": {} }
      }
    }
  }
}'

# 성능 로그 정책 (7일 보관)
curl -X PUT "localhost:9200/_ilm/policy/logs-perf-policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_age": "1d", "max_primary_shard_size": "2gb" }
        }
      },
      "delete": {
        "min_age": "7d",
        "actions": { "delete": {} }
      }
    }
  }
}'

echo "ILM policies created successfully!"
```

---

## 9. 모니터링 및 알림

### 9.1 Kibana 대시보드 구성

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FileServer 로깅 대시보드                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  📊 실시간 현황 (1시간)                                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ 요청 수     │ │ 에러 수     │ │ 평균 응답   │ │ 업로드 수   │          │
│  │   12,345    │ │     23      │ │   145ms     │ │    456      │          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                                             │
│  📈 에러 트렌드 (24시간)                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  [시간대별 에러 발생 그래프]                                                │
│                                                                             │
│  🔴 최근 에러 (Top 10)                                                      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  │ 시간 │ 카테고리 │ 에러 코드 │ 메시지 │ TraceId │                        │
│  │ ... │ ...      │ ...       │ ...    │ ...     │                        │
│                                                                             │
│  📁 파일 작업 상태                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • 동기화 대기: 42건                                                        │
│  • 동기화 실패: 3건                                                         │
│  • 색인 대기: 15건                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 알림 규칙

| 알림 | 조건 | 채널 | 심각도 |
|------|------|------|--------|
| 에러율 급증 | 5분간 에러율 > 5% | Slack | Warning |
| 서비스 다운 | 5분간 로그 0건 | Slack, Email | Critical |
| NAS 동기화 실패 | 실패 > 10건/시간 | Slack | Warning |
| 보안 이벤트 | 인증 실패 > 50건/분 | Slack, Email | Critical |
| 디스크 부족 | ES 디스크 > 80% | Slack | Warning |

---

## 10. 구현 로드맵

### Phase 1: 기본 인프라 (1주)

- [ ] docker-compose.yml에 ES, Logstash, Filebeat, Kibana 추가
- [ ] Winston 기반 LoggingModule 생성
- [ ] Filebeat, Logstash 설정 파일 작성
- [ ] ILM 정책 스크립트 작성
- [ ] 인덱스 템플릿 생성

### Phase 2: 로그 타입별 구현 (2주)

- [ ] FileOperationLogger 구현 (traceId 기반)
- [ ] HttpLoggingInterceptor 구현
- [ ] BackgroundJobLogger 구현
- [ ] InfrastructureLogger 구현
- [ ] 기존 서비스에 로깅 코드 추가

### Phase 3: 감사/보안 로깅 (1주)

- [ ] AuditLogger 구현 + PostgreSQL 저장
- [ ] SecurityLogger 구현
- [ ] 감사 로그 테이블 생성
- [ ] 알림 연동 (Slack Webhook)

### Phase 4: 대시보드 및 알림 (1주)

- [ ] Kibana 대시보드 구성
- [ ] 알림 규칙 설정
- [ ] ILM 정책 검증
- [ ] 문서화 완료

---

## 📝 문서 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0 | 2026-01-12 | 최초 작성 - 단일 ES 통합 방식 |

---

*이 문서는 FileServer 프로젝트의 ELK Stack 기반 로깅 아키텍처를 설명합니다.*
