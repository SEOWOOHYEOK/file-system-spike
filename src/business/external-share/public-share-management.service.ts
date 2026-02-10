import {
  Injectable,
} from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { v4 as uuidv4 } from 'uuid';
import type { SharedFileStats } from '../../domain/external-share/repositories/public-share.repository.interface';
import type { PaginationParams, PaginatedResult } from '../../common/types/pagination';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import { SharePermission } from '../../domain/external-share/type/public-share.type';
import { PublicShareDomainService } from './public-share-domain.service';
import { FileState } from '../../domain/file/type/file.type';
import { FileDomainService } from '../../domain/file';
import {
  ExternalUserDomainService,
  PublicShareDomainService as PublicShareRepositoryService,
} from '../../domain/external-share';

/**
 * 외부 공유 생성 DTO 
 */
export interface CreatePublicShareDto {
  fileId: string;
  externalUserId: string;
  permissions: SharePermission[];
  maxViewCount?: number;
  maxDownloadCount?: number;
  expiresAt?: Date;
}

/**
 * PublicShareManagementService
 *
 * 외부 공유 관리 서비스
 * - 내부 사용자: 공유 생성/취소/조회
 * - 관리자: 공유 차단/해제, 일괄 차단, 통계 조회
 */
@Injectable()
export class PublicShareManagementService {
  constructor(
    private readonly shareDomainService: PublicShareDomainService,
    private readonly shareRepositoryService: PublicShareRepositoryService,
    private readonly externalUserDomainService: ExternalUserDomainService,
    private readonly fileDomainService: FileDomainService,
  ) { }

  /**
   * 외부 공유 생성 (내부 사용자용)
   */
  async createPublicShare(
    ownerId: string,
    dto: CreatePublicShareDto,
  ): Promise<PublicShare> {
    // 파일 존재 확인
    const file = await this.fileDomainService.조회(dto.fileId);
    if (!file) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_FILE_NOT_FOUND, { fileId: dto.fileId });
    }

    if (file.state !== FileState.ACTIVE) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_FILE_NOT_ACTIVE, { fileId: dto.fileId });
    }

    // 외부 사용자 존재 확인
    const externalUser = await this.externalUserDomainService.조회(dto.externalUserId);
    if (!externalUser) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_TARGET_NOT_FOUND, { externalUserId: dto.externalUserId });
    }

    // 중복 공유 확인
    const existing = await this.shareRepositoryService.파일외부사용자조회(
      dto.fileId,
      dto.externalUserId,
    );



    if (existing) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_DUPLICATE, {
        fileId: dto.fileId,
        externalUserId: dto.externalUserId,
      });
    }

    const share = new PublicShare({
      id: uuidv4(),
      fileId: dto.fileId,
      ownerId,
      externalUserId: dto.externalUserId,
      permissions: dto.permissions as unknown as SharePermission[],
      maxViewCount: dto.maxViewCount,
      currentViewCount: 0,
      maxDownloadCount: dto.maxDownloadCount,
      currentDownloadCount: 0,
      expiresAt: dto.expiresAt,
      isBlocked: false,
      isRevoked: false,
      createdAt: new Date(),
    });

    return this.shareRepositoryService.저장(share);
  }

  /**
   * 공유 취소 (내부 사용자용 - 소유자만)
   */
  async revokeShare(ownerId: string, shareId: string): Promise<PublicShare> {
    const share = await this.shareRepositoryService.조회(shareId);
    if (!share) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_NOT_FOUND, { shareId });
    }

    if (share.ownerId !== ownerId) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_NOT_OWNER, { shareId, ownerId });
    }

    share.revoke();
    return this.shareRepositoryService.저장(share);
  }

  /**
   * 내가 생성한 공유 목록 (내부 사용자용)
   */
  async getMyPublicShares(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.shareDomainService.findByOwnerWithFiles(ownerId, pagination);
  }

  /**
   * 공유 차단 
   */
  async blockShare(adminId: string, shareId: string): Promise<PublicShare> {
    const share = await this.shareRepositoryService.조회(shareId);
    if (!share) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_NOT_FOUND, { shareId });
    }

    share.block(adminId);
    return this.shareRepositoryService.저장(share);
  }

  /**
   * 차단 해제 
   */
  async unblockShare(shareId: string): Promise<PublicShare> {
    const share = await this.shareRepositoryService.조회(shareId);
    if (!share) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_NOT_FOUND, { shareId });
    }

    share.unblock();
    return this.shareRepositoryService.저장(share);
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단 
   */
  async blockAllSharesByFile(
    adminId: string,
    fileId: string,
  ): Promise<{ blockedCount: number }> {
    const blockedCount = await this.shareRepositoryService.파일공유일괄차단(fileId, adminId);
    return { blockedCount };
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단 해제 (관리자용)
   */
  async unblockAllSharesByFile(
    fileId: string,
  ): Promise<{ unblockedCount: number }> {
    const unblockedCount = await this.shareRepositoryService.파일공유일괄차단해제(fileId);
    return { unblockedCount };
  }

  /**
   * 특정 외부 사용자의 모든 공유 일괄 차단 (관리자용)
   */
  async blockAllSharesByExternalUser(
    adminId: string,
    externalUserId: string,
  ): Promise<{ blockedCount: number }> {
    // 외부 사용자 존재 확인 (내부 사용자 ID로 차단 방지)
    const externalUser = await this.externalUserDomainService.조회(externalUserId);
    if (!externalUser) {
      throw BusinessException.of(ErrorCodes.EXT_USER_NOT_FOUND, { externalUserId });
    }

    const blockedCount = await this.shareRepositoryService.외부사용자공유일괄차단(
      externalUserId,
      adminId,
    );
    return { blockedCount };
  }
  /**
 * 전체 공유 현황 (관리자용)
 */
  async getAllPublicShares(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.shareDomainService.findALLWithFile(pagination);
  }

  /**
   * 공유 상세 조회
   */
  async getPublicShareById(shareId: string): Promise<PublicShare> {
    const share = await this.shareRepositoryService.조회(shareId);
    if (!share) {
      throw BusinessException.of(ErrorCodes.PUBLIC_SHARE_NOT_FOUND, { shareId });
    }
    return share;
  }

  /**
   * 특정 파일의 공유 목록
   */
  async getSharesByFileId(fileId: string): Promise<PublicShare[]> {
    return this.shareRepositoryService.파일별조회(fileId);
  }
}
