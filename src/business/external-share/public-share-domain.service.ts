/**
 * PublicShare 비즈니스 서비스
 *
 * PublicShare와 File Aggregate를 조합하여 완전한 공유 정보를 제공합니다.
 *
 * DDD 관점:
 * - Repository는 단일 Aggregate만 담당
 * - 여러 Aggregate 조합은 비즈니스 레이어에서 담당
 */

import { Injectable } from '@nestjs/common';
import { PublicShare } from '../../domain/external-share/entities/public-share.entity';
import type { PaginationParams, PaginatedResult } from '../../common/types/pagination';
import { FileDomainService } from '../../domain/file';
import {
  PublicShareDomainService as PublicShareRepositoryService,
  ExternalUserDomainService,
} from '../../domain/external-share';
import type { FileEntity } from '../../domain/file/entities/file.entity';
import type { ExternalUser } from '../../domain/external-share/entities/external-user.entity';

/**
 * 파일 검증 결과
 */
export interface FileValidationResult {
  valid: boolean;
  file: FileEntity | null;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class PublicShareDomainService {
  constructor(
    private readonly shareRepositoryService: PublicShareRepositoryService,
    private readonly fileDomainService: FileDomainService,
    private readonly externalUserDomainService: ExternalUserDomainService,
  ) {}

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================


  /**
   * 전체 공유 조회 + 파일/외부사용자 메타데이터 채움
   */
  async findALLWithFile(pagination: PaginationParams): Promise<PaginatedResult<PublicShare>> {
    const result = await this.shareRepositoryService.전체조회(pagination);
    await this.enrichSharesWithAllMetadata(result.items);
    return result;
  }

  /**
   * ID로 공유 조회 + 파일/외부사용자 메타데이터 채움
   */
  async findByIdWithFile(id: string): Promise<PublicShare | null> {
    const share = await this.shareRepositoryService.조회(id);
    if (!share) {
      return null;
    }

    await this.enrichShareWithAllMetadata(share);
    return share;
  }

  /**
   * 외부 사용자의 공유 목록 조회 + 파일/외부사용자 메타데이터 일괄 채움
   */
  async findByExternalUserWithFiles(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const result = await this.shareRepositoryService.외부사용자별조회(
      externalUserId,
      pagination,
    );

    // 배치로 파일 + 외부사용자 정보 조회 (N+1 방지)
    await this.enrichSharesWithAllMetadata(result.items);

    return result;
  }

  /**
   * 소유자의 공유 목록 조회 + 파일/외부사용자 메타데이터 일괄 채움
   */
  async findByOwnerWithFiles(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const result = await this.shareRepositoryService.소유자별조회(ownerId, pagination);

    // 배치로 파일 + 외부사용자 정보 조회 (N+1 방지)
    await this.enrichSharesWithAllMetadata(result.items);

    return result;
  }

  /**
   * 공유 목록에 파일/외부사용자 메타데이터 일괄 채움 (외부 호출용)
   */
  async enrichShares(shares: PublicShare[]): Promise<void> {
    await this.enrichSharesWithAllMetadata(shares);
  }

  // ============================================
  // 검증 메서드 (Validation Methods)
  // ============================================

  /**
   * 파일이 공유 가능한 상태인지 검증
   *
   * 검증 항목:
   * - 파일 존재 여부
   * - ACTIVE 상태 여부 (휴지통/삭제됨 아님)
   */
  async validateFileForShare(fileId: string): Promise<FileValidationResult> {
    const file = await this.fileDomainService.조회(fileId);

    if (!file) {
      return {
        valid: false,
        file: null,
        errorCode: 'FILE_NOT_FOUND',
        errorMessage: '파일을 찾을 수 없습니다.',
      };
    }

    if (file.isTrashed()) {
      return {
        valid: false,
        file,
        errorCode: 'FILE_IN_TRASH',
        errorMessage: '휴지통에 있는 파일입니다.',
      };
    }

    if (file.isDeleted()) {
      return {
        valid: false,
        file,
        errorCode: 'FILE_DELETED',
        errorMessage: '삭제된 파일입니다.',
      };
    }

    return {
      valid: true,
      file,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * 단일 share에 파일 + 외부사용자 메타데이터 채움
   */
  private async enrichShareWithAllMetadata(share: PublicShare): Promise<void> {
    await Promise.all([
      this.enrichShareWithFileMetadata(share),
      this.enrichShareWithExternalUserInfo(share),
    ]);
  }

  /**
   * 여러 share에 파일 + 외부사용자 메타데이터 일괄 채움
   */
  private async enrichSharesWithAllMetadata(
    shares: PublicShare[],
  ): Promise<void> {
    if (shares.length === 0) return;
    await Promise.all([
      this.enrichSharesWithFileMetadata(shares),
      this.enrichSharesWithExternalUserInfo(shares),
    ]);
  }

  /**
   * 단일 share에 파일 메타데이터 채움
   */
  private async enrichShareWithFileMetadata(share: PublicShare): Promise<void> {
    const file = await this.fileDomainService.조회(share.fileId);
    if (file) {
      share.fileName = file.name;
      share.mimeType = file.mimeType;
      share.fileSize = file.sizeBytes;
      share.fileCreatedBy = file.createdBy;
    }
  }

  /**
   * 여러 share에 파일 메타데이터 일괄 채움 (배치 조회)
   */
  private async enrichSharesWithFileMetadata(
    shares: PublicShare[],
  ): Promise<void> {
    if (shares.length === 0) return;

    // 중복 제거된 fileId 목록 추출
    const fileIds = [...new Set(shares.map((s) => s.fileId))];

    // 배치로 파일 조회
    const files = await this.fileDomainService.아이디목록조회(fileIds);

    // fileId -> FileEntity 맵 생성
    const fileMap = new Map<string, FileEntity>();
    for (const file of files) {
      fileMap.set(file.id, file);
    }

    // 각 share에 파일 메타데이터 채움
    for (const share of shares) {
      const file = fileMap.get(share.fileId);
      if (file) {
        share.fileName = file.name;
        share.mimeType = file.mimeType;
        share.fileSize = file.sizeBytes;
        share.fileCreatedBy = file.createdBy;
      }
    }
  }

  /**
   * 단일 share에 외부 사용자 메타데이터 채움
   */
  private async enrichShareWithExternalUserInfo(
    share: PublicShare,
  ): Promise<void> {
    const user = await this.externalUserDomainService.조회(share.externalUserId);
    if (user) {
      share.externalUserName = user.name;
      share.externalUserCompany = user.company ?? '';
      share.externalUserDepartment = user.department ?? '';
    }
  }

  /**
   * 여러 share에 외부 사용자 메타데이터 일괄 채움 (배치 조회)
   */
  private async enrichSharesWithExternalUserInfo(
    shares: PublicShare[],
  ): Promise<void> {
    if (shares.length === 0) return;

    // 중복 제거된 externalUserId 목록 추출
    const externalUserIds = [...new Set(shares.map((s) => s.externalUserId))];

    // 배치로 외부 사용자 조회
    const users = await this.externalUserDomainService.아이디목록조회(externalUserIds);

    // externalUserId -> ExternalUser 맵 생성
    const userMap = new Map<string, ExternalUser>();
    for (const user of users) {
      userMap.set(user.id, user);
    }

    // 각 share에 외부 사용자 메타데이터 채움
    for (const share of shares) {
      const user = userMap.get(share.externalUserId);
      if (user) {
        share.externalUserName = user.name;
        share.externalUserCompany = user.company ?? '';
        share.externalUserDepartment = user.department ?? '';
      }
    }
  }
}
