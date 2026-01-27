import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  FILE_SHARE_REPOSITORY,
} from '../../domain/share/repositories/file-share.repository.interface';
import { FileShare } from '../../domain/share/entities/file-share.entity';
import { SharePermission } from '../../domain/share/share-permission.enum';
import type { IFileShareRepository } from '../../domain/share/repositories/file-share.repository.interface';

/**
 * Share Access 서비스
 *
 * 수신자(Recipient)의 공유 파일 접근 관리
 */
@Injectable()
export class ShareAccessService {
  constructor(
    @Inject(FILE_SHARE_REPOSITORY)
    private readonly shareRepo: IFileShareRepository,
  ) { }

  /**
   * 나에게 공유된 파일 목록 조회
   */
  async getMyShares(recipientId: string): Promise<FileShare[]> {
    return this.shareRepo.findByRecipient(recipientId);
  }

  /**
   * 공유 접근 검증 및 추적
   *
   * @param shareId 공유 ID
   * @param userId 요청자 ID
   * @param requiredPermission 필요한 권한 (VIEW/DOWNLOAD)
   * @returns 검증 통과한 FileShare
   * @throws NotFoundException 공유가 없거나 수신자가 아닌 경우
   * @throws ForbiddenException 만료/제한 초과/권한 없음
   */
  async validateAndTrackAccess(
    shareId: string,
    userId: string,
    requiredPermission: SharePermission,
  ): Promise<FileShare> {
    // 1. 공유 조회 및 수신자 검증
    const share = await this.shareRepo.findById(shareId);
    if (!share || share.recipientId !== userId) {
      throw new NotFoundException('Share not found');
    }

    // 2. 공유 유효성 검증
    if (!share.isValid()) {
      throw new ForbiddenException(
        'Share has expired or download limit exceeded',
      );
    }

    // 3. 권한 검증
    if (!share.hasPermission(requiredPermission)) {
      throw new ForbiddenException(
        `Permission ${requiredPermission} is not granted for this share`,
      );
    }

    // 4. DOWNLOAD인 경우 다운로드 횟수 증가 및 저장
    if (requiredPermission === SharePermission.DOWNLOAD) {
      share.incrementDownloadCount();
      await this.shareRepo.save(share);
    }

    return share;
  }
}
