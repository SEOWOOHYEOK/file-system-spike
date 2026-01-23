/**
 * 휴지통 메타데이터 엔티티
 * 삭제된 파일/폴더의 원래 위치 및 삭제 정보를 관리합니다.
 */

/**
 * 휴지통 아이템 타입
 */
export enum TrashItemType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

/**
 * 휴지통 메타데이터 엔티티
 */
export class TrashMetadataEntity {
  id: string;
  /** 파일 ID (파일인 경우) */
  fileId?: string;
  /** 폴더 ID (폴더인 경우) */
  folderId?: string;
  /** 원래 경로 */
  originalPath: string;
  /** 원래 상위 폴더 ID */
  originalFolderId?: string;
  /** 원래 상위 폴더 ID (폴더인 경우) */
  originalParentId?: string;
  /** 삭제한 사용자 */
  deletedBy: string;
  /** 삭제 일시 */
  deletedAt: Date;
  /** 자동 영구삭제 예정일 */
  expiresAt: Date;

  constructor(partial: Partial<TrashMetadataEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 아이템 타입 반환
   */
  getItemType(): TrashItemType {
    if (this.fileId) {
      return TrashItemType.FILE;
    }
    return TrashItemType.FOLDER;
  }

  /**
   * 파일 아이템인지 확인
   */
  isFile(): boolean {
    return !!this.fileId;
  }

  /**
   * 폴더 아이템인지 확인
   */
  isFolder(): boolean {
    return !!this.folderId;
  }

  /**
   * 대상 ID 반환 (fileId 또는 folderId)
   */
  getTargetId(): string {
    return this.fileId || this.folderId || '';
  }

  /**
   * 만료 여부 확인
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * 휴지통 경로 계산
   */
  getTrashPath(): string {
    return `/.trash/${this.id}${this.originalPath}`;
  }

  /**
   * 만료일 연장
   */
  extendExpiry(days: number): void {
    const newExpiry = new Date(this.expiresAt);
    newExpiry.setDate(newExpiry.getDate() + days);
    this.expiresAt = newExpiry;
  }
}

/**
 * 휴지통 메타데이터 생성 팩토리
 */
export class TrashMetadataFactory {
  /**
   * 파일용 휴지통 메타데이터 생성
   */
  static createForFile(params: {
    id: string;
    fileId: string;
    originalPath: string;
    originalFolderId: string;
    deletedBy: string;
    retentionDays?: number;
  }): TrashMetadataEntity {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + (params.retentionDays ?? 30));

    return new TrashMetadataEntity({
      id: params.id,
      fileId: params.fileId,
      originalPath: params.originalPath,
      originalFolderId: params.originalFolderId,
      deletedBy: params.deletedBy,
      deletedAt: now,
      expiresAt,
    });
  }

  /**
   * 폴더용 휴지통 메타데이터 생성
   */
  static createForFolder(params: {
    id: string;
    folderId: string;
    originalPath: string;
    originalParentId: string | null;
    deletedBy: string;
    retentionDays?: number;
  }): TrashMetadataEntity {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + (params.retentionDays ?? 30));

    return new TrashMetadataEntity({
      id: params.id,
      folderId: params.folderId,
      originalPath: params.originalPath,
      originalParentId: params.originalParentId ?? undefined,
      deletedBy: params.deletedBy,
      deletedAt: now,
      expiresAt,
    });
  }
}
