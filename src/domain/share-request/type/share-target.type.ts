/**
 * 공유 대상 타입 열거형
 */
export enum ShareTargetType {
  /** 내부 사용자 */
  INTERNAL_USER = 'INTERNAL_USER',
  /** 외부 사용자 */
  EXTERNAL_USER = 'EXTERNAL_USER',
}

/**
 * 공유 대상 인터페이스
 */
export interface ShareTarget {
  /** 대상 타입 */
  type: ShareTargetType;
  /** 사용자 ID (내부 또는 외부 사용자 UUID) */
  userId: string;
}
