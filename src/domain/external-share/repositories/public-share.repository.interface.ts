import { PublicShare } from '../entities/public-share.entity';
import type { PaginationParams, PaginatedResult } from '../../../common/types/pagination';

/**
 * 공유된 파일 통계 정보
 */
export interface SharedFileStats {
  fileId: string;
  fileName: string;
  mimeType: string;
  shareCount: number;
  activeShareCount: number;
  totalViewCount: number;
  totalDownloadCount: number;
  firstSharedAt: Date;
  lastSharedAt: Date;
}

/**
 * PublicShare Repository 인터페이스
 *
 * PublicShare 도메인 엔티티의 영속성 관리를 위한 추상화
 */
export interface IPublicShareRepository {
  /**
   * PublicShare 저장 (생성 또는 업데이트)
   */
  save(share: PublicShare): Promise<PublicShare>;

  /**
   * ID로 PublicShare 조회
   */
  findById(id: string): Promise<PublicShare | null>;

  /**
   * 외부 사용자의 모든 공유 조회 (페이지네이션)
   */
  findByExternalUser(
    externalUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>>;

  /**
   * 소유자(Owner)의 모든 공유 조회 (페이지네이션)
   */
  findByOwner(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PublicShare>>;

  /**
   * 특정 파일의 모든 공유 조회
   */
  findByFileId(fileId: string): Promise<PublicShare[]>;

  /**
   * 파일+외부사용자로 공유 조회 (중복 공유 확인용)
   */
  findByFileAndExternalUser(
    fileId: string,
    externalUserId: string,
  ): Promise<PublicShare | null>;

  /**
   * 모든 공유 조회 (관리자용, 페이지네이션)
   */
  findAll(pagination: PaginationParams): Promise<PaginatedResult<PublicShare>>;

  /**
   * 특정 파일의 모든 공유 일괄 차단
   * @returns 차단된 공유 수
   */
  blockAllByFileId(fileId: string, blockedBy: string): Promise<number>;

  /**
   * 특정 파일의 모든 공유 일괄 차단 해제
   * @returns 해제된 공유 수
   */
  unblockAllByFileId(fileId: string): Promise<number>;

  /**
   * 특정 외부 사용자의 모든 공유 일괄 차단
   * @returns 차단된 공유 수
   */
  blockAllByExternalUserId(
    externalUserId: string,
    blockedBy: string,
  ): Promise<number>;

  /**
   * 공유된 파일 통계 조회 (관리자용)
   */
  getSharedFilesStats(
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SharedFileStats>>;

  /**
   * PublicShare 삭제
   */
  delete(id: string): Promise<void>;
}

export const PUBLIC_SHARE_REPOSITORY = Symbol('PUBLIC_SHARE_REPOSITORY');
