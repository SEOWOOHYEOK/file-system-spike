import { SharePermission } from '../type/public-share.type';

/** 
 * PublicShare 도메인 엔티티 (Aggregate Root)
 *
 * 내부 사용자가 외부 사용자에게 파일을 공유할 때 생성
 * - 뷰 횟수, 다운로드 횟수, 만료일 제한 가능
 * - 관리자가 차단하거나 소유자가 취소 가능
 */
export class PublicShare {
  id: string;
  fileId: string;
  ownerId: string;
  externalUserId: string;

  permissions: SharePermission[];

  // 뷰 제한
  maxViewCount?: number;
  currentViewCount: number;

  // 다운로드 제한
  maxDownloadCount?: number;
  currentDownloadCount: number;

  // 기간 제한
  expiresAt?: Date;

  // 관리자 차단
  isBlocked: boolean;
  blockedAt?: Date;
  blockedBy?: string;

  // 소유자 취소
  isRevoked: boolean;

  // 메타
  createdAt: Date;
  updatedAt?: Date;

  constructor(props: Partial<PublicShare>) {
    Object.assign(this, props);
    // 기본값 설정
    this.currentViewCount = this.currentViewCount ?? 0;
    this.currentDownloadCount = this.currentDownloadCount ?? 0;
    this.isBlocked = this.isBlocked ?? false;
    this.isRevoked = this.isRevoked ?? false;
    this.permissions = this.permissions ?? [];
  }

  /**
   * 공유가 유효한지 종합 검증
   * - 차단/취소 상태 확인
   * - 만료일 확인
   * - 뷰/다운로드 횟수 제한 확인
   */
  isValid(): boolean {
    if (this.isBlocked || this.isRevoked) return false;
    if (this.isExpired()) return false;
    return true;
  }

  /**
   * 만료 여부 확인
   */
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  /**
   * 뷰 횟수 제한 초과 여부
   */
  isViewLimitExceeded(): boolean {
    if (this.maxViewCount === undefined) return false;
    return this.currentViewCount >= this.maxViewCount;
  }

  /**
   * 다운로드 횟수 제한 초과 여부
   */
  isDownloadLimitExceeded(): boolean {
    if (this.maxDownloadCount === undefined) return false;
    return this.currentDownloadCount >= this.maxDownloadCount;
  }

  /**
   * 뷰 카운트 증가
   * @throws 뷰 제한 초과 시 에러
   */
  incrementViewCount(): void {
    if (this.isViewLimitExceeded()) {
      throw new Error('View limit exceeded');
    }
    this.currentViewCount++;
    this.updatedAt = new Date();
  }

  /**
   * 다운로드 카운트 증가
   * @throws 다운로드 제한 초과 시 에러
   */
  incrementDownloadCount(): void {
    if (this.isDownloadLimitExceeded()) {
      throw new Error('Download limit exceeded');
    }
    this.currentDownloadCount++;
    this.updatedAt = new Date();
  }

  /**
   * 특정 권한 보유 여부 확인
   */
  hasPermission(permission: SharePermission): boolean {
    return this.permissions.includes(permission);
  }

  /**
   * 관리자 차단
   * @param adminId 차단하는 관리자 ID
   */
  block(adminId: string): void {
    this.isBlocked = true;
    this.blockedBy = adminId;
    this.blockedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 차단 해제
   */
  unblock(): void {
    this.isBlocked = false;
    this.blockedBy = undefined;
    this.blockedAt = undefined;
    this.updatedAt = new Date();
  }

  /**
   * 소유자 취소
   */
  revoke(): void {
    this.isRevoked = true;
    this.updatedAt = new Date();
  }
}
