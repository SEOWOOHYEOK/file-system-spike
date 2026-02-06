/**
 * 작업 큐 포트
 * 실제 구현은 Infrastructure에서 어댑터로 제공됩니다.
 *
 * 구현체:
 * - BullQueueAdapter: Redis 기반 Bull 큐
 * - LocalFileQueueAdapter: 로컬 파일 시스템 기반 큐
 */

/**
 * 작업 데이터 타입
 */
export interface JobData {
  [key: string]: any;
}

/**
 * 작업 옵션
 */
export interface JobOptions {
  /** 지연 실행 (ms) */
  delay?: number;
  /** 재시도 횟수 */
  attempts?: number;
  /** 재시도 간격 (ms) */
  backoff?: number;
  /** 우선순위 (낮을수록 높은 우선순위) */
  priority?: number;
  /** 고유 작업 ID */
  jobId?: string;
  /** 작업 제거 완료 시 자동 삭제 */
  removeOnComplete?: boolean;
  /** 작업 실패 시 자동 삭제 */
  removeOnFail?: boolean;
}

/**
 * 작업 상태
 */
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

/**
 * 큐 통계 정보
 */
export interface QueueStats {
  /** 대기 중 */
  waiting: number;
  /** 처리 중 */
  active: number;
  /** 완료 */
  completed: number;
  /** 실패 */
  failed: number;
  /** 지연됨 */
  delayed: number;
}

/**
 * 작업 엔티티
 */
export interface Job<T = JobData> {
  /** 작업 ID */
  id: string;
  /** 큐 이름 */
  queueName: string;
  /** 작업 데이터 */
  data: T;
  /** 작업 상태 */
  status: JobStatus;
  /** 진행률 (0-100) */
  progress?: number;
  /** 생성 시간 */
  createdAt: Date;
  /** 처리 시작 시간 */
  processedAt?: Date;
  /** 완료 시간 */
  completedAt?: Date;
  /** 실패 사유 */
  failedReason?: string;
  /** 시도 횟수 */
  attemptsMade?: number;
}

/**
 * 작업 처리 함수 타입
 */
export type JobProcessor<T = JobData> = (job: Job<T>) => Promise<void>;

/**
 * 프로세서 옵션
 */
export interface ProcessorOptions {
  /** 동시 처리 수 (기본값: 1) */
  concurrency?: number;
}

/**
 * 작업 큐 인터페이스
 */
export interface IJobQueuePort {
  /**
   * 작업 추가
   * @param queueName - 큐 이름
   * @param data - 작업 데이터
   * @param options - 작업 옵션
   * @returns 생성된 작업
   */
  addJob<T = JobData>(queueName: string, data: T, options?: JobOptions): Promise<Job<T>>;

  /**
   * 작업 처리기 등록
   * @param queueName - 큐 이름
   * @param processor - 처리 함수
   * @param options - 프로세서 옵션 (concurrency 등)
   */
  processJobs<T = JobData>(
    queueName: string,
    processor: JobProcessor<T>,
    options?: ProcessorOptions,
  ): Promise<void>;

  /**
   * 작업 조회
   * @param queueName - 큐 이름
   * @param jobId - 작업 ID
   * @returns 작업 또는 null
   */
  getJob<T = JobData>(queueName: string, jobId: string): Promise<Job<T> | null>;

  /**
   * 작업 제거
   * @param queueName - 큐 이름
   * @param jobId - 작업 ID
   */
  removeJob(queueName: string, jobId: string): Promise<void>;

  /**
   * 대기 중인 작업 수
   * @param queueName - 큐 이름
   * @returns 대기 중인 작업 수
   */
  getWaitingCount(queueName: string): Promise<number>;

  /**
   * 활성 작업 수
   * @param queueName - 큐 이름
   * @returns 활성 작업 수
   */
  getActiveCount(queueName: string): Promise<number>;

  /**
   * 완료된 작업 수
   * @param queueName - 큐 이름
   * @returns 완료된 작업 수
   */
  getCompletedCount(queueName: string): Promise<number>;

  /**
   * 실패한 작업 수
   * @param queueName - 큐 이름
   * @returns 실패한 작업 수
   */
  getFailedCount(queueName: string): Promise<number>;

  /**
   * 큐 정리 (완료/실패 작업 삭제)
   * @param queueName - 큐 이름
   */
  cleanQueue(queueName: string): Promise<void>;

  /**
   * 큐 일시 정지
   * @param queueName - 큐 이름
   */
  pauseQueue(queueName: string): Promise<void>;

  /**
   * 큐 재개
   * @param queueName - 큐 이름
   */
  resumeQueue(queueName: string): Promise<void>;

  /**
   * 큐 통계 조회
   * @param queueName - 큐 이름
   * @returns 큐 통계 정보
   */
  getQueueStats(queueName: string): Promise<QueueStats>;

  /**
   * 등록된 모든 큐 이름 조회
   * @returns 큐 이름 목록
   */
  getAllQueueNames(): string[];

  /**
   * 상태별 작업 목록 조회
   * @param queueName - 큐 이름
   * @param limit - 각 상태별 최대 조회 수 (기본값: 50)
   * @returns 상태별 작업 목록
   */
  getJobsByStatus<T = JobData>(queueName: string, limit?: number): Promise<JobsByStatusResult<T>>;
}

/**
 * 상태별 작업 목록 결과
 */
export interface JobsByStatusResult<T = JobData> {
  waiting: Job<T>[];
  active: Job<T>[];
  delayed: Job<T>[];
  failed: Job<T>[];
  completed: Job<T>[];
}

/**
 * 작업 큐 포트 토큰 (의존성 주입용)
 */
export const JOB_QUEUE_PORT = Symbol('JOB_QUEUE_PORT');
