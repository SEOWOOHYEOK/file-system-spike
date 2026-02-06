/**
 * 진행률 저장소 포트
 * 동기화 작업의 실시간 진행률을 저장/조회합니다.
 *
 * 구현체:
 * - RedisProgressAdapter: Redis 기반 (운영 환경, QUEUE_TYPE=redis)
 * - FileProgressAdapter: 파일 기반 (개발 환경, QUEUE_TYPE=local)
 *
 * 특징:
 * - SyncEvent와 분리된 일시적 데이터 저장소
 * - TTL 기반 자동 만료 (기본 1시간)
 * - 빈번한 업데이트에 최적화 (DB 부하 없음)
 */

/**
 * 동기화 진행률 정보
 */
export interface SyncProgress {
  /** 파일 ID */
  fileId: string;
  /** 동기화 이벤트 ID */
  syncEventId: string;
  /** 이벤트 타입 */
  eventType: 'CREATE' | 'MOVE' | 'RENAME' | 'TRASH' | 'RESTORE' | 'PURGE';
  /** 상태 */
  status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';
  /** 진행률 상세 */
  progress: {
    /** 백분율 (0-100) */
    percent: number;
    /** 완료된 청크 수 */
    completedChunks?: number;
    /** 전체 청크 수 */
    totalChunks?: number;
    /** 전송된 바이트 */
    bytesTransferred?: number;
    /** 전체 바이트 */
    totalBytes?: number;
  };
  /** 처리 시작 시간 (ISO) */
  startedAt: string;
  /** 마지막 업데이트 시간 (ISO) */
  updatedAt: string;
  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * 진행률 저장소 인터페이스
 */
export interface IProgressStoragePort {
  /**
   * 진행률 설정 (초기화 또는 전체 업데이트)
   * @param syncEventId - 동기화 이벤트 ID
   * @param progress - 진행률 정보
   */
  set(syncEventId: string, progress: SyncProgress): Promise<void>;

  /**
   * 진행률 조회
   * @param syncEventId - 동기화 이벤트 ID
   * @returns 진행률 정보 또는 null (없거나 만료된 경우)
   */
  get(syncEventId: string): Promise<SyncProgress | null>;

  /**
   * 진행률 삭제
   * @param syncEventId - 동기화 이벤트 ID
   */
  delete(syncEventId: string): Promise<void>;

  /**
   * 진행률 부분 업데이트
   * @param syncEventId - 동기화 이벤트 ID
   * @param partial - 업데이트할 필드들
   */
  update(syncEventId: string, partial: Partial<SyncProgress>): Promise<void>;
}

/**
 * 진행률 저장소 포트 토큰 (의존성 주입용)
 */
export const PROGRESS_STORAGE_PORT = Symbol('PROGRESS_STORAGE_PORT');
