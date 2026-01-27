/**
 * 동기화 이벤트 엔티티
 * NAS 비동기 작업의 Outbox 역할 + 작업 히스토리/재시도 관리
 */

/**
 * 이벤트 타입
 */
export enum SyncEventType {
  /** 업로드/수정 → 캐시에서 NAS로 복사 */
  CREATE = 'CREATE',
  /** 파일/폴더 이동 */
  MOVE = 'MOVE',
  /** 영구 삭제 */
  DELETE = 'DELETE',
  /** 이름 변경 */
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
   * [파일] 생성 이벤트 생성 (CREATE)
   * 캐시에서 NAS로 복사
   */
  static createFileCreateEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    fileName: string;
    folderId: string;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.CREATE,
      targetType: SyncEventTargetType.FILE,
      fileId: params.fileId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: { fileName: params.fileName, folderId: params.folderId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [파일] 이름 변경 이벤트 생성 (RENAME)
   */
  static createFileRenameEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    oldName: string;
    newName: string;
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
      metadata: { oldName: params.oldName, newName: params.newName },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [파일] 이동 이벤트 생성 (MOVE)
   */
  static createFileMoveEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    originalFolderId: string;
    targetFolderId: string;
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
      metadata: { originalFolderId: params.originalFolderId, targetFolderId: params.targetFolderId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [파일] 휴지통 이동 이벤트 생성 (TRASH)
   */
  static createFileTrashEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
    originalPath: string;
    originalFolderId: string;
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
      metadata: { originalPath: params.originalPath, originalFolderId: params.originalFolderId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [파일] 복원 이벤트 생성
   */
  static createFileRestoreEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
    targetPath: string;
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [파일] 영구삭제 이벤트 생성
   */
  static createFilePurgeEvent(params: {
    id: string;
    fileId: string;
    sourcePath: string;
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [폴더] 생성 이벤트 생성 (CREATE)
   */
  static createFolderCreateEvent(params: {
    id: string;
    folderId: string;
    targetPath: string;
    folderName: string;
    parentId: string | null;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.CREATE,
      targetType: SyncEventTargetType.FOLDER,
      folderId: params.folderId,
      sourcePath: '',
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: { folderName: params.folderName, parentId: params.parentId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [폴더] 이름 변경 이벤트 생성 (RENAME)
   */
  static createFolderRenameEvent(params: {
    id: string;
    folderId: string;
    sourcePath: string;
    targetPath: string;
    oldName: string;
    newName: string;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.RENAME,
      targetType: SyncEventTargetType.FOLDER,
      folderId: params.folderId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: { oldName: params.oldName, newName: params.newName },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [폴더] 이동 이벤트 생성 (MOVE)
   */
  static createFolderMoveEvent(params: {
    id: string;
    folderId: string;
    sourcePath: string;
    targetPath: string;
    originalParentId: string | null;
    targetParentId: string;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.MOVE,
      targetType: SyncEventTargetType.FOLDER,
      folderId: params.folderId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: { originalParentId: params.originalParentId, targetParentId: params.targetParentId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [폴더] 휴지통 이동 이벤트 생성 (TRASH)
   */
  static createFolderTrashEvent(params: {
    id: string;
    folderId: string;
    sourcePath: string;
    targetPath: string;
    originalPath: string;
    originalParentId: string | null;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.TRASH,
      targetType: SyncEventTargetType.FOLDER,
      folderId: params.folderId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      metadata: { originalPath: params.originalPath, originalParentId: params.originalParentId },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [폴더] 복원 이벤트 생성
   */
  static createFolderRestoreEvent(params: {
    id: string;
    folderId: string;
    sourcePath: string;
    targetPath: string;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.RESTORE,
      targetType: SyncEventTargetType.FOLDER,
      folderId: params.folderId,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * [폴더] 영구삭제 이벤트 생성
   */
  static createFolderPurgeEvent(params: {
    id: string;
    folderId: string;
    sourcePath: string;
  }): SyncEventEntity {
    return new SyncEventEntity({
      id: params.id,
      eventType: SyncEventType.PURGE,
      targetType: SyncEventTargetType.FOLDER,
      folderId: params.folderId,
      sourcePath: params.sourcePath,
      targetPath: '',
      status: SyncEventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
