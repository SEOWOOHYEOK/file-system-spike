/**
 * 파일 도메인 엔티티
 * 파일의 핵심 속성과 상태를 정의합니다.
 * 
 * DDD 관점: File은 Aggregate Root로서 파일 메타데이터의 일관성을 보장합니다.
 * 스토리지 관련 로직은 FileStorageObjectEntity에서 별도로 관리합니다.
 */

/**
 * 파일 상태
 */
export enum FileState {
  ACTIVE = 'ACTIVE',//활성
  TRASHED = 'TRASHED',//휴지통
  DELETED = 'DELETED',//삭제
}

/**
 * 파일 엔티티
 */
export class FileEntity {
  id: string;
  name: string;
  folderId: string;
  sizeBytes: number;
  mimeType: string;
  state: FileState;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<FileEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 파일이 활성 상태인지 확인
   */
  isActive(): boolean {
    return this.state === FileState.ACTIVE;
  }


  /**
   * 파일이 삭제되었는지 확인
   */
  isDeleted(): boolean {
    return this.state === FileState.DELETED;
  }

  /**
   * 파일이 영구삭제 상태인지 확인
   */
  isPermanentlyDeleted(): boolean {
    return this.state === FileState.DELETED;
  }

  /**
   * 파일이 휴지통 상태인지 확인
   */
  isTrashed(): boolean {
    return this.state === FileState.TRASHED;
  }
  
  /**
   * 삭제(휴지통)
   */
  delete(): void {
    if (!this.isActive()) {
      throw new Error('활성 상태의 파일만 삭제할 수 있습니다.');
    }
    this.state = FileState.TRASHED;
    this.updatedAt = new Date();
  }

  /**
   * 영구 삭제
   */
  permanentDelete(): void {
    if (this.state !== FileState.TRASHED) {
      throw new Error('휴지통에 있는 파일만 영구 삭제할 수 있습니다.');
    }
    this.state = FileState.DELETED;
    this.updatedAt = new Date();
  }

  /**
   * 파일명 변경
   */
  rename(newName: string): void {
    if (!this.isActive()) {
      throw new Error('활성 상태의 파일만 이름을 변경할 수 있습니다.');
    }
    this.name = newName;
    this.updatedAt = new Date();
  }

  /**
   * 파일 위치 변경 (이동)
   */
  moveTo(targetFolderId: string): void {
    if (!this.isActive()) {
      throw new Error('활성 상태의 파일만 이동할 수 있습니다.');
    }
    this.folderId = targetFolderId;
    this.updatedAt = new Date();
  }
}
