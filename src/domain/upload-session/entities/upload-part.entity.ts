/**
 * 업로드 파트 도메인 엔티티
 * 멀티파트 업로드의 개별 파트 정보를 관리합니다.
 */

import { UploadPartStatus } from '../type/upload-session.type';

/**
 * 업로드 파트 엔티티
 */
export class UploadPartEntity {
  /** 파트 ID (UUID) */
  id: string;

  /** 세션 ID */
  sessionId: string;

  /** 파트 번호 (1부터 시작) */
  partNumber: number;

  /** 파트 크기 (bytes) */
  size: number;

  /** ETag (캐시 스토리지에서 반환) */
  etag?: string;

  /** 파트 상태 */
  status: UploadPartStatus;

  /** 캐시 스토리지 내 objectKey */
  objectKey?: string;

  /** 생성 시간 */
  createdAt: Date;

  /** 수정 시간 */
  updatedAt: Date;

  constructor(partial: Partial<UploadPartEntity>) {
    Object.assign(this, partial);
    this.status = this.status ?? UploadPartStatus.PENDING;
  }

  /**
   * 새 파트 생성
   */
  static create(params: {
    id: string;
    sessionId: string;
    partNumber: number;
    size: number;
    objectKey?: string;
  }): UploadPartEntity {
    const now = new Date();
    return new UploadPartEntity({
      id: params.id,
      sessionId: params.sessionId,
      partNumber: params.partNumber,
      size: params.size,
      objectKey: params.objectKey,
      status: UploadPartStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * 대기 중인지 확인
   */
  isPending(): boolean {
    return this.status === UploadPartStatus.PENDING;
  }

  /**
   * 업로드 중인지 확인
   */
  isUploading(): boolean {
    return this.status === UploadPartStatus.UPLOADING;
  }

  /**
   * 완료되었는지 확인
   */
  isCompleted(): boolean {
    return this.status === UploadPartStatus.COMPLETED;
  }

  /**
   * 실패했는지 확인
   */
  isFailed(): boolean {
    return this.status === UploadPartStatus.FAILED;
  }

  /**
   * 업로드 시작
   */
  startUpload(): void {
    this.status = UploadPartStatus.UPLOADING;
    this.updatedAt = new Date();
  }

  /**
   * 업로드 완료
   */
  complete(etag: string, objectKey: string): void {
    this.status = UploadPartStatus.COMPLETED;
    this.etag = etag;
    this.objectKey = objectKey;
    this.updatedAt = new Date();
  }

  /**
   * 업로드 실패
   */
  fail(): void {
    this.status = UploadPartStatus.FAILED;
    this.updatedAt = new Date();
  }
}
