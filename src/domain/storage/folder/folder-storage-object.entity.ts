/**
 * 폴더 스토리지 객체 도메인 엔티티
 * 폴더의 NAS 저장 위치 및 상태를 관리합니다.
 * 
 * DDD 관점: FolderStorageObject는 Folder Aggregate와 연관되지만,
 * 독립적인 생명주기를 가지며 별도의 책임(스토리지 관리)을 담당합니다.
 */

/**
 * 스토리지 가용성 상태
 */
export enum FolderAvailabilityStatus {
  AVAILABLE = 'AVAILABLE',//사용가능
  SYNCING = 'SYNCING',//동기화중
  MOVING = 'MOVING',//이동중
  ERROR = 'ERROR',//실패
}

/**
 * 폴더 스토리지 객체 엔티티
 * 폴더의 NAS 저장 위치 및 상태를 관리합니다.
 */
export class FolderStorageObjectEntity {
  id: string;
  folderId: string;
  storageType: string; // 'NAS'
  objectKey: string;
  availabilityStatus: FolderAvailabilityStatus;
  createdAt: Date;
  updatedAt?: Date;

  constructor(partial: Partial<FolderStorageObjectEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 스토리지가 사용 가능한지 확인
   */
  isAvailable(): boolean {
    return this.availabilityStatus === FolderAvailabilityStatus.AVAILABLE;
  }

  /**
   * 동기화 중인지 확인
   */
  isSyncing(): boolean {
    return this.availabilityStatus === FolderAvailabilityStatus.SYNCING;
  }

  /**
   * 상태 변경
   */
  updateStatus(status: FolderAvailabilityStatus): void {
    this.availabilityStatus = status;
    this.updatedAt = new Date();
  }

  /**
   * 경로 변경
   */
  updateObjectKey(newKey: string): void {
    this.objectKey = newKey;
    this.updatedAt = new Date();
  }
}
