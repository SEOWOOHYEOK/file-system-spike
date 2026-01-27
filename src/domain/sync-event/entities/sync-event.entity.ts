/**
 * 동기화 이벤트 엔티티
 * NAS 비동기 작업의 Outbox 역할 + 작업 히스토리/재시도 관리
 */

/**
 * 이벤트 타입
 */
export enum SyncEventType {
  /** 업로드/수정 → 캐시에서 NAS로 복사 */
  SYNC = 'SYNC',
  /** 파일/폴더 이동 */
  MOVE = 'MOVE',
  /** 영구 삭제 */
  DELETE = 'DELETE',
  /** 파일명 변경 */
  RENAME = 'RENAME',
  /** 휴지통 이동 */
  TRASH = 'TRASH',
  /** 복구 */
  RESTORE = 'RESTORE',
  /** 영구 삭제 (Purge) */
  PURGE = 'PURGE',
}

/**
 * 대상 타입
 */
export enum SyncEventTargetType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

/**
 * 이벤트 상태
 */
export enum SyncEventStatus {
  /** 트랜잭션 내 INSERT, Scheduler 대기 */
  PENDING = 'PENDING',
  /** Scheduler가 Bull에 발행 후 */
  PROCESSING = 'PROCESSING',
  /** Worker 성공 완료 */
  DONE = 'DONE',
  /** 최대 재시도 후 실패 */
  FAILED = 'FAILED',
}

/**
 * 동기화 이벤트 엔티티
 */
export class SyncEventEntity {
  id: string;

  /** 이벤트 타입 */
  eventType: SyncEventType;

  /** 대상 타입 */
  targetType: SyncEventTargetType;

  /** 파일 ID (파일인 경우) */
  fileId?: string;

  /** 폴더 ID (폴더인 경우) */
  folderId?: string;

  /** 원본 경로 */
  sourcePath: string;

  /** 대상 경로 */
  targetPath: string;

  /** 상태 */
  status: SyncEventStatus;

  /** 재시도 횟수 */
  retryCount: number;

  /** 최대 재시도 횟수 */
  maxRetries: number;

  /** 에러 메시지 */
  errorMessage?: string;

  /** 메타데이터 (JSON) */
  metadata?: Record<string, any>;

  /** 처리 완료 시각 */
  processedAt?: Date;

  /** 생성 시각 */
  createdAt: Date;

  /** 수정 시각 */
  updatedAt: Date;

  constructor(partial: Partial<SyncEventEntity>) {
    Object.assign(this, partial);
    this.retryCount = this.retryCount ?? 0;
    this.maxRetries = this.maxRetries ?? 3;
  }

  /**
   * 대기 중인지 확인
   */
  isPending(): boolean {
    return this.status === SyncEventStatus.PENDING;
  }

  /**
   * 처리 중인지 확인
   */
  isProcessing(): boolean {
    return this.status === SyncEventStatus.PROCESSING;
  }

  /**
   * 완료되었는지 확인
   */
  isDone(): boolean {
    return this.status === SyncEventStatus.DONE;
  }

  /**
   * 실패했는지 확인
   */
  isFailed(): boolean {
    return this.status === SyncEventStatus.FAILED;
  }

  /**
   * 완료 여부 (DONE 또는 FAILED)
   */
  isCompleted(): boolean {
    return this.isDone() || this.isFailed();
  }

  /**
   * 처리 시작
   */
  startProcessing(): void {
    this.status = SyncEventStatus.PROCESSING;
    this.updatedAt = new Date();
  }

  /**
   * 처리 완료
   */
  complete(): void {
    this.status = SyncEventStatus.DONE;
    this.processedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 처리 실패
   */
  fail(errorMessage: string): void {
    this.status = SyncEventStatus.FAILED;
    this.errorMessage = errorMessage;
    this.updatedAt = new Date();
  }

  /**
   * 재시도
   */
  retry(errorMessage: string): boolean {
    if (this.retryCount >= this.maxRetries) {
      this.fail(errorMessage);
      return false;
    }
    this.retryCount++;
    this.errorMessage = errorMessage;
    this.status = SyncEventStatus.PENDING;
    this.updatedAt = new Date();
    return true;
  }
}

/**
 * 동기화 이벤트 생성 팩토리
 */
export class SyncEventFactory {
  /**
   * 업로드 동기화 이벤트 생성 (SYNC)
   * 캐시에서 NAS로 복사
   */
  static createSyncEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    metadata?: Record<string, any>;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.SYNC,
      targetType: SyncEventTargetType.FILE,
      fileId: params.fileId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * 파일명 변경 이벤트 생성 (RENAME)
   */
  static createRenameEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    metadata?: Record<string, any>;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.RENAME,
      targetType: SyncEventTargetType.FILE,
      fileId: params.fileId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * 파일 이동 이벤트 생성 (MOVE)
   */
  static createMoveEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    metadata?: Record<string, any>;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.MOVE,
      targetType: SyncEventTargetType.FILE,
      fileId: params.fileId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * 휴지통 이동 이벤트 생성 (TRASH)
   */
  static createTrashEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    metadata?: Record<string, any>;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.TRASH,
      targetType: SyncEventTargetType.FILE,
      fileId: params.fileId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * 복원 이벤트 생성
   */
  static createRestoreEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    metadata?: Record<string, any>;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.RESTORE,
      targetType: SyncEventTargetType.FILE,
      fileId: params.fileId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * 영구삭제 이벤트 생성
   */
  static createPurgeEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    metadata?: Record<string, any>;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.PURGE,
      targetType: SyncEventTargetType.FILE,
      fileId: params.fileId,
      sourcePath: params.sourcePath,
      targetPath: '',
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
