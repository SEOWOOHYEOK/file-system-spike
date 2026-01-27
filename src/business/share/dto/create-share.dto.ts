import { SharePermission } from '../../../domain/share/share-permission.enum';

/**
 * 공유 생성 DTO
 *
 * POST /shares 요청에 사용
 */
export class CreateShareDto {
  /** 공유할 파일 ID */
  fileId: string;

  /** 수신자(Recipient) User ID */
  recipientId: string;

  /** 부여할 권한 목록 */
  permissions: SharePermission[];

  /** 최대 다운로드 횟수 (선택) */
  maxDownloadCount?: number;

  /** 만료일 (선택) */
  expiresAt?: Date;
}
