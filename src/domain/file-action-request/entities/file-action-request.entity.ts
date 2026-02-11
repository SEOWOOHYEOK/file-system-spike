import { FileActionType } from '../enums/file-action-type.enum';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';

/**
 * FileActionRequest 도메인 엔티티 (Aggregate Root)
 *
 * 파일 이동/삭제 요청을 나타내는 엔티티
 * - User가 Manager/Admin에게 파일 작업을 요청
 * - 승인/반려/취소 상태 관리
 * - 승인 시 낙관적 검증 후 자동 실행
 */
export class FileActionRequest {
  id: string;
  type: FileActionType;
  status: FileActionRequestStatus;

  // 대상 파일
  fileId: string;
  fileName: string;

  // 이동 전용 (type=MOVE)
  sourceFolderId?: string;
  targetFolderId?: string;

  // 요청자/승인자
  requesterId: string;
  designatedApproverId: string;
  approverId?: string;

  // 사유/코멘트
  reason: string;
  decisionComment?: string;

  // 낙관적 검증 스냅샷
  snapshotFolderId: string;
  snapshotFileState: string;

  // 실행 결과
  executionNote?: string;

  // 타임스탬프
  requestedAt: Date;
  decidedAt?: Date;
  executedAt?: Date;
  updatedAt?: Date;

  constructor(props: Partial<FileActionRequest>) {
    Object.assign(this, props);
    this.status = this.status ?? FileActionRequestStatus.PENDING;
    this.requestedAt = this.requestedAt ?? new Date();
  }

  /** PENDING 상태인지 확인 */
  isDecidable(): boolean {
    return this.status === FileActionRequestStatus.PENDING;
  }

  /** APPROVED 상태인지 확인 */
  isExecutable(): boolean {
    return this.status === FileActionRequestStatus.APPROVED;
  }

  /** 승인 */
  approve(approverId: string, comment?: string): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be approved');
    }
    this.status = FileActionRequestStatus.APPROVED;
    this.approverId = approverId;
    this.decidedAt = new Date();
    this.decisionComment = comment;
    this.updatedAt = new Date();
  }

  /** 반려 (comment 필수) */
  reject(approverId: string, comment: string): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be rejected');
    }
    if (!comment || comment.trim().length === 0) {
      throw new Error('Rejection comment is required');
    }
    this.status = FileActionRequestStatus.REJECTED;
    this.approverId = approverId;
    this.decidedAt = new Date();
    this.decisionComment = comment;
    this.updatedAt = new Date();
  }

  /** 취소 */
  cancel(): void {
    if (!this.isDecidable()) {
      throw new Error('Only PENDING requests can be canceled');
    }
    this.status = FileActionRequestStatus.CANCELED;
    this.updatedAt = new Date();
  }

  /**
   * 낙관적 검증: 요청 시점 스냅샷과 현재 파일 상태 비교
   * 불일치 시 INVALIDATED로 전환
   */
  validateStateForExecution(currentFolderId: string, currentFileState: string): boolean {
    if (!this.isExecutable()) {
      throw new Error('Only APPROVED requests can be validated for execution');
    }

    if (this.snapshotFolderId !== currentFolderId) {
      this.status = FileActionRequestStatus.INVALIDATED;
      this.executionNote = `파일 위치 변경됨 (요청 시점: ${this.snapshotFolderId}, 현재: ${currentFolderId})`;
      this.updatedAt = new Date();
      return false;
    }

    if (currentFileState !== 'ACTIVE') {
      this.status = FileActionRequestStatus.INVALIDATED;
      this.executionNote = `파일 상태 변경됨 (요청 시점: ${this.snapshotFileState}, 현재: ${currentFileState})`;
      this.updatedAt = new Date();
      return false;
    }

    return true;
  }

  /** 실행 완료 */
  markExecuted(): void {
    if (!this.isExecutable()) {
      throw new Error('Only APPROVED requests can be marked as executed');
    }
    this.status = FileActionRequestStatus.EXECUTED;
    this.executedAt = new Date();
    this.updatedAt = new Date();
  }

  /** 실행 실패 */
  markFailed(reason: string): void {
    if (!this.isExecutable()) {
      throw new Error('Only APPROVED requests can be marked as failed');
    }
    this.status = FileActionRequestStatus.FAILED;
    this.executionNote = reason;
    this.updatedAt = new Date();
  }
}
