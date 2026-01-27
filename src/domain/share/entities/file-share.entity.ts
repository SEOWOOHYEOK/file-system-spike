import { SharePermission } from '../share-permission.enum';

/**
 * FileShare 도메인 엔티티 (Aggregate Root)
 *
 * 1:1 파일 공유 시스템의 핵심 엔티티
 * - 파일 소유자(Owner)가 특정 수신자(Recipient)에게 파일 공유
 * - 만료일, 다운로드 횟수 제한, 권한 설정 가능
 */
export class FileShare {
  id: string;
  fileId: string;
  ownerId: string;
  recipientId: string;
  permissions: SharePermission[];
  maxDownloadCount?: number;
  currentDownloadCount: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: Partial<FileShare>) {
    Object.assign(this, props);
    this.currentDownloadCount = this.currentDownloadCount || 0;
    this.permissions = this.permissions || [];
  }

  /**
   * 공유가 유효한지 확인
   * - 만료일 지났으면 무효
   * - 다운로드 횟수 초과하면 무효
   */
  isValid(): boolean {
    const now = new Date();
    if (this.expiresAt && now > this.expiresAt) return false;
    if (
      this.maxDownloadCount !== undefined &&
      this.currentDownloadCount >= this.maxDownloadCount
    )
      return false;
    return true;
  }

  /**
   * 다운로드 횟수 증가
   * @throws 다운로드 제한 초과 시 에러
   */
  incrementDownloadCount(): void {
    if (
      this.maxDownloadCount !== undefined &&
      this.currentDownloadCount >= this.maxDownloadCount
    ) {
      throw new Error('Download limit exceeded');
    }
    this.currentDownloadCount++;
    this.updatedAt = new Date();
  }

  /**
   * 특정 권한이 있는지 확인
   */
  hasPermission(permission: SharePermission): boolean {
    return this.permissions.includes(permission);
  }
}
