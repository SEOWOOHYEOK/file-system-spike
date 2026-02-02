/**
 * 파일 스토리지 객체 도메인 엔티티
 * 파일의 물리적 저장 위치 및 상태를 관리합니다.
 * 
 * DDD 관점: FileStorageObject는 File Aggregate와 연관되지만,
 * 독립적인 생명주기를 가지며 별도의 책임(스토리지 관리)을 담당합니다.
 */

/**
 * 스토리지 타입
 */
export enum StorageType {
  CACHE = 'CACHE',//캐시 역할
  NAS = 'NAS',//NAS 역할
}



/**
 * 스토리지 가용성 상태
 */
export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',//사용가능
  SYNCING = 'SYNCING',//동기화중
  MISSING = 'MISSING',//누락
  EVICTING = 'EVICTING',//추방중(캐싱제거중)
  ERROR = 'ERROR',//실패
}


// | `AVAILABLE` | 정상. 파일 접근 가능 | 업로드 완료, 동기화 완료, 복구 완료 | 다운로드, 수정, 삭제 |
// | `SYNCING` | NAS 동기화 중 | 업로드 직후, 수정 직후 | 다운로드만 (캐시에서) |
// | `PENDING` | 작업 대기 중 | 삭제 대기 (캐시), 배치 처리 대기 | 없음 |
// | `MOVING` | 이동 중 | 휴지통 이동, 복구 중 | 없음 |
// | `BUSY` | 다른 작업 진행 중 | activeSyncEventId != NULL | 없음 (409 반환) |
// | `ERROR` | 동기화/작업 실패 | 최대 재시도 초과 후 | 관리자 개입 필요 |
// | `MISSING` | 캐시에서 eviction됨 | 캐시 정리 후 | NAS에서 복원 후 다운로드 |
// | `EVICTING` | 캐시 정리 중 | 캐시 용량 부족 시 | 없음 |


/**
 * 파일 스토리지 객체 엔티티
 * 파일의 물리적 저장 위치 및 상태를 관리합니다.
 */
export class FileStorageObjectEntity {
  id: string;
  fileId: string;
  storageType: StorageType;
  objectKey: string;
  availabilityStatus: AvailabilityStatus;
  lastAccessed?: Date;
  accessCount: number;
  leaseCount: number;
  createdAt: Date;
  updatedAt?: Date;

  constructor(partial: Partial<FileStorageObjectEntity>) {
    Object.assign(this, partial);
    this.accessCount = this.accessCount ?? 0;
    this.leaseCount = this.leaseCount ?? 0;
  }

  /**
   * 스토리지가 사용 가능한지 확인
   */
  isAvailable(): boolean {
    return this.availabilityStatus === AvailabilityStatus.AVAILABLE;
  }

  /**
   * 동기화 중인지 확인
   */
  isSyncing(): boolean {
    return this.availabilityStatus === AvailabilityStatus.SYNCING;
  }

  /**
   * lease 획득 (다운로드 시작)
   */
  acquireLease(): void {
    this.leaseCount += 1;
    this.lastAccessed = new Date();
    this.accessCount += 1;
  }

  /**
   * lease 해제 (다운로드 완료)
   */
  releaseLease(): void {
    this.leaseCount = Math.max(this.leaseCount - 1, 0);
  }

  /**
   * 상태 변경
   */
  
  updateStatus(status: AvailabilityStatus): void {
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

  /**
   * NAS objectKey 생성 (도메인 규칙)
   * 형식: YYYYMMDDHHmmss__파일명 (UTC 기준)
   */
  static buildNasObjectKey(createdAt: Date, fileName: string): string {
    const y = createdAt.getUTCFullYear().toString().padStart(4, '0');
    const m = (createdAt.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = createdAt.getUTCDate().toString().padStart(2, '0');
    const hh = createdAt.getUTCHours().toString().padStart(2, '0');
    const mm = createdAt.getUTCMinutes().toString().padStart(2, '0');
    const ss = createdAt.getUTCSeconds().toString().padStart(2, '0');
    return `${y}${m}${d}${hh}${mm}${ss}__${fileName}`;
  }

  /**
   * 캐시 스토리지 객체 생성 팩토리
   */
  static createForCache(params: {
    id: string;
    fileId: string;
  }): FileStorageObjectEntity {
    return new FileStorageObjectEntity({
      id: params.id,
      fileId: params.fileId,
      storageType: StorageType.CACHE,
      objectKey: params.fileId,
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      lastAccessed: new Date(),
      accessCount: 1,
      leaseCount: 0,
      createdAt: new Date(),
    });
  }

  /**
   * NAS 스토리지 객체 생성 팩토리
   */
  static createForNas(params: {
    id: string;
    fileId: string;
    createdAt: Date;
    fileName: string;
  }): FileStorageObjectEntity {
    return new FileStorageObjectEntity({
      id: params.id,
      fileId: params.fileId,
      storageType: StorageType.NAS,
      objectKey: FileStorageObjectEntity.buildNasObjectKey(params.createdAt, params.fileName),
      availabilityStatus: AvailabilityStatus.SYNCING,
      accessCount: 0,
      leaseCount: 0,
      createdAt: params.createdAt,
    });
  }
}
