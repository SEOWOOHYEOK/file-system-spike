/**
 * 업로드 세션 도메인 엔티티
 * 멀티파트 업로드의 세션 정보를 관리합니다.
 *
 * DDD 관점: UploadSession은 Aggregate Root로서 멀티파트 업로드의 일관성을 보장합니다.
 */

import {
  UploadSessionStatus,
  DEFAULT_PART_SIZE,
  SESSION_EXPIRY_MS,
} from '../type/upload-session.type';

/**
 * 업로드 세션 엔티티
 */
export class UploadSessionEntity {
  /** 세션 ID (UUID) */
  id: string;

  /** 원본 파일명 */
  fileName: string;

  /** 대상 폴더 ID */
  folderId: string;

  /** 파일 전체 크기 (bytes) */
  totalSize: number;

  /** 파트 크기 (bytes) */
  partSize: number;

  /** 총 파트 수 */
  totalParts: number;

  /** MIME 타입 */
  mimeType: string;

  /** 세션 상태 */
  status: UploadSessionStatus;

  /** 업로드된 바이트 수 */
  uploadedBytes: number;

  /** 완료된 파트 번호 목록 */
  completedParts: number[];

  /** 세션 만료 시간 */
  expiresAt: Date;

  /** 생성된 파일 ID (완료 시) */
  fileId?: string;

  /** 캐시 스토리지 uploadId (SeaweedFS 등에서 사용) */
  uploadId?: string;

  /** 충돌 전략 */
  conflictStrategy?: string;

  /** 생성 시간 */
  createdAt: Date;

  /** 수정 시간 */
  updatedAt: Date;

  constructor(partial: Partial<UploadSessionEntity>) {
    Object.assign(this, partial);
    this.completedParts = this.completedParts ?? [];
    this.uploadedBytes = this.uploadedBytes ?? 0;
    this.status = this.status ?? UploadSessionStatus.INIT;
  }

  /**
   * 새 세션 생성
   */
  static create(params: {
    id: string;
    fileName: string;
    folderId: string;
    totalSize: number;
    mimeType: string;
    partSize?: number;
    uploadId?: string;
    conflictStrategy?: string;
  }): UploadSessionEntity {
    const partSize = params.partSize ?? DEFAULT_PART_SIZE;
    const totalParts = Math.ceil(params.totalSize / partSize);
    const now = new Date();

    return new UploadSessionEntity({
      id: params.id,
      fileName: params.fileName,
      folderId: params.folderId,
      totalSize: params.totalSize,
      mimeType: params.mimeType,
      partSize,
      totalParts,
      status: UploadSessionStatus.INIT,
      uploadedBytes: 0,
      completedParts: [],
      uploadId: params.uploadId,
      conflictStrategy: params.conflictStrategy,
      expiresAt: new Date(now.getTime() + SESSION_EXPIRY_MS),
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * 초기화 상태인지 확인
   */
  isInit(): boolean {
    return this.status === UploadSessionStatus.INIT;
  }

  /**
   * 업로드 중인지 확인
   */
  isUploading(): boolean {
    return this.status === UploadSessionStatus.UPLOADING;
  }

  /**
   * 완료되었는지 확인
   */
  isCompleted(): boolean {
    return this.status === UploadSessionStatus.COMPLETED;
  }

  /**
   * 취소되었는지 확인
   */
  isAborted(): boolean {
    return this.status === UploadSessionStatus.ABORTED;
  }

  /**
   * 만료되었는지 확인
   */
  isExpired(): boolean {
    if (this.status === UploadSessionStatus.EXPIRED) {
      return true;
    }
    return new Date() > this.expiresAt;
  }

  /**
   * 활성 상태인지 확인 (INIT 또는 UPLOADING, COMPLETING 제외)
   */
  isActive(): boolean {
    return (
      (this.isInit() || this.isUploading()) && !this.isExpired()
    );
  }

  /**
   * 파트 업로드 가능 여부 확인
   */
  canUploadPart(partNumber: number): boolean {
    if (!this.isActive()) {
      return false;
    }
    if (partNumber < 1 || partNumber > this.totalParts) {
      return false;
    }
    return true;
  }

  /**
   * 모든 파트가 완료되었는지 확인
   */
  allPartsCompleted(): boolean {
    return this.completedParts.length === this.totalParts;
  }

  /**
   * 파트 완료 등록
   */
  markPartCompleted(partNumber: number, partSize: number): void {
    if (!this.completedParts.includes(partNumber)) {
      this.completedParts.push(partNumber);
      this.completedParts.sort((a, b) => a - b);
      this.uploadedBytes += partSize;
    }

    if (this.status === UploadSessionStatus.INIT) {
      this.status = UploadSessionStatus.UPLOADING;
    }

    this.updatedAt = new Date();
  }

  /**
   * 업로드 진행률 계산 (0-100)
   */
  getProgress(): number {
    if (this.totalSize === 0) return 100;
    return Math.round((this.uploadedBytes / this.totalSize) * 100);
  }

  /**
   * 다음 업로드할 파트 번호 계산
   */
  getNextPartNumber(): number | null {
    for (let i = 1; i <= this.totalParts; i++) {
      if (!this.completedParts.includes(i)) {
        return i;
      }
    }
    return null;
  }

  /**
   * 미완료 파트 목록 조회
   */
  getPendingParts(): number[] {
    const pending: number[] = [];
    for (let i = 1; i <= this.totalParts; i++) {
      if (!this.completedParts.includes(i)) {
        pending.push(i);
      }
    }
    return pending;
  }

  /**
   * NAS sync 진행 중 상태인지 확인 (COMPLETING)
   */
  isCompleting(): boolean {
    return this.status === UploadSessionStatus.COMPLETING;
  }

  /**
   * 세션 병합 중 처리 (비동기 complete 진입)
   * 파트 업로드 완료 → NAS sync + 캐시 concat 진행 상태
   */
  completing(fileId: string): void {
    if (!this.allPartsCompleted()) {
      throw new Error('모든 파트가 완료되지 않았습니다.');
    }
    this.status = UploadSessionStatus.COMPLETING;
    this.fileId = fileId;
    this.updatedAt = new Date();
  }

  /**
   * 세션 완료 처리
   */
  complete(fileId: string): void {
    if (!this.allPartsCompleted()) {
      throw new Error('모든 파트가 완료되지 않았습니다.');
    }
    this.status = UploadSessionStatus.COMPLETED;
    this.fileId = fileId;
    this.updatedAt = new Date();
  }

  /**
   * 세션 취소 처리
   */
  abort(): void {
    if (this.isCompleted() || this.isCompleting()) {
      throw new Error('이미 완료되었거나 처리 중인 세션은 취소할 수 없습니다.');
    }
    this.status = UploadSessionStatus.ABORTED;
    this.updatedAt = new Date();
  }

  /**
   * 세션 만료 처리
   */
  expire(): void {
    if (this.isCompleted() || this.isCompleting()) {
      throw new Error('이미 완료되었거나 처리 중인 세션은 만료 처리할 수 없습니다.');
    }
    this.status = UploadSessionStatus.EXPIRED;
    this.updatedAt = new Date();
  }
}
