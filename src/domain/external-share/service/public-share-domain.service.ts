/**
 * PublicShare 도메인 서비스
 *
 * PublicShare와 File Aggregate를 조합하여 완전한 공유 정보를 제공합니다.
 *
 * DDD 관점:
 * - Repository는 단일 Aggregate만 담당
 * - 도메인 서비스는 여러 Aggregate 조합 담당
 */

import { Inject, Injectable } from '@nestjs/common';
import { PublicShare } from '../entities/public-share.entity';
import {
  PUBLIC_SHARE_REPOSITORY,
  type IPublicShareRepository,
} from '../repositories/public-share.repository.interface';
import {
  PaginationParams,
  PaginatedResult,
} from '../repositories/external-user.repository.interface';
import {
  FILE_REPOSITORY,
  type IFileRepository,
} from '../../file/repositories/file.repository.interface';
import type { FileEntity } from '../../file/entities/file.entity';

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
    @Inject(PUBLIC_SHARE_REPOSITORY)
    private readonly shareRepo: IPublicShareRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepo: IFileRepository,
  ) {}

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================


  /**
   * ID로 공유 조회 + 파일 메타데이터 채움
   */
  async findALLWithFile(pagination: PaginationParams): Promise<PaginatedResult<PublicShare>> {
    const result = await this.shareRepo.findAll(pagination);
 

    await this.enrichSharesWithFileMetadata(result.items);
    return result;
  }

  /**
   * ID로 공유 조회 + 파일 메타데이터 채움
   */
  async findByIdWithFile(id: string): Promise<PublicShare | null> {
    const share = await this.shareRepo.findById(id);
    if (!share) {
      return null;
    }

    await this.enrichShareWithFileMetadata(share);
    return share;
  }

  /**
   * 외부 사용자의 공유 목록 조회 + 파일 메타데이터 일괄 채움
   */
  async findByExternalUserWithFiles(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const result = await this.shareRepo.findByExternalUser(
      externalUserId,
      pagination,
    );

    // 배치로 파일 정보 조회 (N+1 방지)
    await this.enrichSharesWithFileMetadata(result.items);

    return result;
  }

  /**
   * 소유자의 공유 목록 조회 + 파일 메타데이터 일괄 채움
   */
  async findByOwnerWithFiles(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>> {
    const result = await this.shareRepo.findByOwner(ownerId, pagination);

    // 배치로 파일 정보 조회 (N+1 방지)
    await this.enrichSharesWithFileMetadata(result.items);

    return result;
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
    const file = await this.fileRepo.findById(fileId);

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
   * 단일 share에 파일 메타데이터 채움
   */
  private async enrichShareWithFileMetadata(share: PublicShare): Promise<void> {
    const file = await this.fileRepo.findById(share.fileId);
    if (file) {
      share.fileName = file.name;
      share.mimeType = file.mimeType;
      share.fileSize = file.sizeBytes;
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
    const files = await this.fileRepo.findByIds(fileIds);

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
      }
    }
  }
}
