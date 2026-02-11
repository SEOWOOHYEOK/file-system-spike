import { ShareRequestStatus } from '../type/share-request-status.enum';
import { ShareTarget } from '../type/share-target.type';
import { Permission } from '../type/share-permission.type';

/**
 * ShareRequest 도메인 엔티티 (Aggregate Root)
 *
 * 파일 공유 요청을 나타내는 엔티티
 * - 내부 사용자가 다른 사용자에게 파일 공유를 요청
 * - 승인/거부/취소 상태 관리
 * - 승인 시 PublicShare 생성
 */
export class ShareRequest {
  id: string;
  status: ShareRequestStatus;
  fileIds: string[];
  requesterId: string;
  targets: ShareTarget[];
  permission: Permission;
  startAt: Date;
  endAt: Date;
  reason: string;
  designatedApproverId: string;
  approverId?: string;
  decidedAt?: Date;
  decisionComment?: string;
  isAutoApproved: boolean;
  publicShareIds: string[];
  requestedAt: Date;
  updatedAt?: Date;

  constructor(props: Partial<ShareRequest>) {
    Object.assign(this, props);
    // 기본값 설정
    this.status = this.status ?? ShareRequestStatus.PENDING;
    this.isAutoApproved = this.isAutoApproved ?? false;
    this.publicShareIds = this.publicShareIds ?? [];
    this.fileIds = this.fileIds ?? [];
    this.targets = this.targets ?? [];
    this.requestedAt = this.requestedAt ?? new Date();
  }

  /**
   * 요청 승인
   * @param approverId 승인자 ID
   * @param comment 승인 코멘트 (선택적)
   * @throws PENDING 상태가 아닐 때 에러
   */
  approve(approverId: string, comment?: string): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be approved');
    }
    this.status = ShareRequestStatus.APPROVED;
    this.approverId = approverId;
    this.decidedAt = new Date();
    this.decisionComment = comment;
    this.updatedAt = new Date();
  }

  /**
   * 요청 거부
   * @param approverId 거부자 ID
   * @param comment 거부 코멘트 (필수)
   * @throws PENDING 상태가 아닐 때 에러
   */
  reject(approverId: string, comment: string): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be rejected');
    }
    if (!comment || comment.trim().length === 0) {
      throw new Error('Rejection comment is required');
    }
    this.status = ShareRequestStatus.REJECTED;
    this.approverId = approverId;
    this.decidedAt = new Date();
    this.decisionComment = comment;
    this.updatedAt = new Date();
  }

  /**
   * 요청 취소
   * @throws PENDING 상태가 아닐 때 에러
   */
  cancel(): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be canceled');
    }
    this.status = ShareRequestStatus.CANCELED;
    this.updatedAt = new Date();
  }

  /**
   * 결정 가능한 상태인지 확인 (PENDING 상태만 결정 가능)
   */
  isDecidable(): boolean {
    return this.status === ShareRequestStatus.PENDING;
  }
}
