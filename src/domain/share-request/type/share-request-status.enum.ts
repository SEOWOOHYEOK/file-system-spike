/**
 * ShareRequest 상태 열거형
 */
export enum ShareRequestStatus {
  /** 대기 중 */
  PENDING = 'PENDING',
  /** 승인됨 */
  APPROVED = 'APPROVED',
  /** 거부됨 */
  REJECTED = 'REJECTED',
  /** 취소됨 */
  CANCELED = 'CANCELED',
}
