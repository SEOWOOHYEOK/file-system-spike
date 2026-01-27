/**
 * User 도메인 엔티티
 *
 * DMS 시스템에서 권한(Authorization)의 주체를 나타냄
 * Employee와 1:1 매핑되며 동일한 ID를 사용
 */
export class User {
  id: string;
  roleId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: {
    id: string;
    roleId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.roleId = props.roleId;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * User에게 Role 부여
   */
  assignRole(roleId: string): void {
    this.roleId = roleId;
    this.updatedAt = new Date();
  }

  /**
   * User의 Role 제거
   */
  removeRole(): void {
    this.roleId = null;
    this.updatedAt = new Date();
  }

  /**
   * User 비활성화 (퇴사/휴직 시)
   */
  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  /**
   * User 활성화 (복직 시)
   */
  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  /**
   * 권한 검사 대상인지 확인
   * 활성 상태이고 Role이 있어야 권한 검사 가능
   */
  hasPermissionEligibility(): boolean {
    return this.isActive && this.roleId !== null;
  }
}
