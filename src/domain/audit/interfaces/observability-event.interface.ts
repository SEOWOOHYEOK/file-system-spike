import type { EventSource } from '../enums/event-source.enum';
import type { SystemAction } from '../enums/system-action.enum';

/**
 * 관찰 가능성 이벤트 공통 인터페이스
 *
 * 모든 이벤트 테이블(AuditLog, FileHistory, SystemEvent)이 구현해야 하는 공통 인터페이스
 *
 * 설계 원칙:
 * - 모든 이벤트는 동일한 구조로 저장되어 통합 조회 가능
 * - 상관관계 추적을 위한 requestId, traceId, parentEventId 지원
 * - 시스템 반응(System Response) 정보 포함
 * - 풍부한 컨텍스트로 "무엇이, 언제, 어떻게, 왜" 발생했는지 기록
 *
 * 활용 예시:
 * - "이 요청(requestId)에서 발생한 모든 이벤트 추적"
 * - "이 작업(traceId)의 전체 흐름 분석"
 * - "이 이벤트(parentEventId)를 유발한 원인 이벤트 찾기"
 * - "시스템이 어떻게 반응했는지(systemAction) 분석"
 */
export interface ObservabilityEvent {
  // === 식별 ===
  /** 이벤트 고유 ID (UUID) */
  id: string;

  /** 이벤트 소스 - AUDIT(사용자 행위) / FILE_CHANGE(파일 변경) / SYSTEM(시스템 자동) */
  eventSource: EventSource;

  /** 이벤트 세부 타입 - AuditAction, FileChangeType, SystemEventType 등 */
  eventType: string;

  // === 시간 ===
  /** 이벤트 발생 시각 (UTC, 밀리초 포함) */
  occurredAt: Date;

  // === 상관관계 (Correlation) ===
  /** HTTP 요청 추적 ID - 단일 요청 내 모든 이벤트 추적 */
  requestId?: string;

  /** 작업 전체 추적 ID - 여러 요청에 걸친 작업 추적 */
  traceId?: string;

  /** 상위 이벤트 ID - 이 이벤트를 유발한 원인 이벤트 (인과관계 추적) */
  parentEventId?: string;

  // === 행위자 ===
  /** 행위자 ID - 사용자 UUID 또는 'SYSTEM' */
  actorId: string;

  /** 행위자 이름 (비정규화, 조회 성능용) */
  actorName?: string;

  // === 대상 ===
  /** 대상 리소스 ID */
  targetId?: string;

  /** 대상 이름 (비정규화, 삭제되어도 유지) */
  targetName?: string;

  // === 결과 ===
  /** 결과 - SUCCESS(성공) / FAILURE(실패) */
  result: 'SUCCESS' | 'FAILURE';

  /** 구조화된 에러 코드 - NAS_UNAVAILABLE, PERMISSION_DENIED 등 */
  errorCode?: string;

  /** 처리 소요 시간 (밀리초) */
  durationMs?: number;

  // === API 컨텍스트 ===
  /** HTTP 메서드 - GET, POST, DELETE 등 */
  httpMethod?: string;

  /** API 엔드포인트 - /v1/files/upload, /v1/file-shares-requests 등 */
  apiEndpoint?: string;

  // === System Response (시스템이 어떻게 반응했는가) ===
  /** HTTP 응답 상태 코드 */
  responseStatusCode?: number;

  /** 시스템이 취한 대응 조치 */
  systemAction?: SystemAction;

  /** 대응 조치 상세 설명 */
  systemActionDetail?: string;

  /** 후속 작업이 예약되었는가 */
  followUpScheduled?: boolean;

  /** 후속 작업 예정 시각 */
  followUpAt?: Date;

  // === 재시도 ===
  /** 재시도 횟수 */
  retryCount?: number;

  // === 분류 ===
  /** 검색/분류용 태그 배열 */
  tags?: string[];

  // === 인간 친화적 설명 ===
  /** 풍부한 컨텍스트의 한국어 설명 */
  description: string;
}
