import {
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  PUBLIC_SHARE_REPOSITORY,
  type IPublicShareRepository,
  SharedFileStats,
} from '../../domain/external-share/repositories/public-share.repository.interface';
import {
  EXTERNAL_USER_REPOSITORY,
  type IExternalUserRepository,
  PaginationParams,
  PaginatedResult,
} from '../../domain/external-share/repositories/external-user.repository.interface';
import {
  FILE_REPOSITORY,
  type IFileRepository,
} from '../../domain/file/repositories/file.repository.interface';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import { SharePermission } from '../../domain/external-share/type/public-share.type';

/**
 * 외부 공유 생성 DTO 
 */
export interface CreatePublicShareDto {
  fileId: string;
  externalUserId: string;
  permissions: typeof SharePermission[];
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
    @Inject(PUBLIC_SHARE_REPOSITORY)
    private readonly shareRepo: IPublicShareRepository,
    @Inject(EXTERNAL_USER_REPOSITORY)
    private readonly userRepo: IExternalUserRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepo: IFileRepository,
  ) {}

  /**
   * 외부 공유 생성 (내부 사용자용)
   */
  async createPublicShare(
    ownerId: string,
    dto: CreatePublicShareDto,
  ): Promise<PublicShare> {
    // 파일 존재 확인
    const file = await this.fileRepo.findById(dto.fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    // 외부 사용자 존재 확인
    const externalUser = await this.userRepo.findById(dto.externalUserId);
    if (!externalUser) {
      throw new NotFoundException('External user not found');
    }

    // 중복 공유 확인
    const existing = await this.shareRepo.findByFileAndExternalUser(
      dto.fileId,
      dto.externalUserId,
    );
    if (existing) {
      throw new ConflictException('Share already exists for this file and user');
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

    return this.shareRepo.save(share);
  }

  /**
   * 공유 취소 (내부 사용자용 - 소유자만)
   */
  async revokeShare(ownerId: string, shareId: string): Promise<PublicShare> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    if (share.ownerId !== ownerId) {
      throw new ForbiddenException('Only owner can revoke share');
    }

    share.revoke();
    return this.shareRepo.save(share);
  }

  /**
   * 내가 생성한 공유 목록 (내부 사용자용)
   */
  async getMyPublicShares(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.shareRepo.findByOwner(ownerId, pagination);
  }

  /**
   * 공유 차단 (관리자용)
   */
  async blockShare(adminId: string, shareId: string): Promise<PublicShare> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    share.block(adminId);
    return this.shareRepo.save(share);
  }

  /**
   * 차단 해제 (관리자용)
   */
  async unblockShare(shareId: string): Promise<PublicShare> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    share.unblock();
    return this.shareRepo.save(share);
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단 (관리자용)
   */
  async blockAllSharesByFile(
    adminId: string,
    fileId: string,
  ): Promise<{ blockedCount: number }> {
    const blockedCount = await this.shareRepo.blockAllByFileId(fileId, adminId);
    return { blockedCount };
  }

  /**
   * 특정 파일의 모든 공유 일괄 차단 해제 (관리자용)
   */
  async unblockAllSharesByFile(
    fileId: string,
  ): Promise<{ unblockedCount: number }> {
    const unblockedCount = await this.shareRepo.unblockAllByFileId(fileId);
    return { unblockedCount };
  }

  /**
   * 특정 외부 사용자의 모든 공유 일괄 차단 (관리자용)
   */
  async blockAllSharesByExternalUser(
    adminId: string,
    externalUserId: string,
  ): Promise<{ blockedCount: number }> {
    const blockedCount = await this.shareRepo.blockAllByExternalUserId(
      externalUserId,
      adminId,
    );
    return { blockedCount };
  }

  /**
   * 공유된 파일 통계 조회 (관리자용)
   */
  async getSharedFiles(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SharedFileStats>> {
    return this.shareRepo.getSharedFilesStats(pagination);
  }

  /**
   * 전체 공유 현황 (관리자용)
   */
  async getAllPublicShares(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    return this.shareRepo.findAll(pagination);
  }

  /**
   * 공유 상세 조회
   */
  async getPublicShareById(shareId: string): Promise<PublicShare> {
    const share = await this.shareRepo.findById(shareId);
    if (!share) {
      throw new NotFoundException('Share not found');
    }
    return share;
  }

  /**
   * 특정 파일의 공유 목록
   */
  async getSharesByFileId(fileId: string): Promise<PublicShare[]> {
    return this.shareRepo.findByFileId(fileId);
  }
}
