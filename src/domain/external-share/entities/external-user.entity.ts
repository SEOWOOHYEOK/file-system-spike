/**
 * ExternalUser 도메인 엔티티
 *
 * 외부 파일 공유 시스템의 외부 사용자 (협력업체, 고객 등)
 * - 관리자가 생성하며, 로그인하여 공유된 파일에 접근
 * - 활성화/비활성화 상태로 접근 제어
 */
export class ExternalUser {
  id: string;

  // 인증 정보
  username: string;
  passwordHash: string;

  // 사용자 정보
  name: string;
  email: string;
  company?: string;
  phone?: string;

  // 상태
  isActive: boolean;

  // 메타
  createdBy: string;
  createdAt: Date;
  lastLoginAt?: Date;

  constructor(props: Partial<ExternalUser>) {
    Object.assign(this, props);
    // 기본값 설정
    this.isActive = this.isActive ?? true;
  }

  /**
   * 로그인 가능 여부 확인
   * - isActive가 false면 로그인 불가
   */
  canLogin(): boolean {
    return this.isActive;
  }

  /**
   * 계정 비활성화
   */
  deactivate(): void {
    this.isActive = false;
  }

  /**
   * 계정 활성화
   */
  activate(): void {
    this.isActive = true;
  }

  /**
   * 마지막 로그인 시간 갱신
   */
  updateLastLogin(): void {
    this.lastLoginAt = new Date();
  }

  /**
   * 비밀번호 변경
   * @param newPasswordHash 새 비밀번호 해시
   */
  updatePassword(newPasswordHash: string): void {
    this.passwordHash = newPasswordHash;
  }
}
