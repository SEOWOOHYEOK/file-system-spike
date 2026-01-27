import { FileShare } from '../entities/file-share.entity';

/**
 * FileShare Repository 인터페이스
 *
 * FileShare 도메인 엔티티의 영속성 관리를 위한 추상화
 */
export interface IFileShareRepository {
  /**
   * FileShare 저장 (생성 또는 업데이트)
   */
  save(share: FileShare): Promise<FileShare>;

  /**
   * ID로 FileShare 조회
   */
  findById(id: string): Promise<FileShare | null>;

  /**
   * 수신자(Recipient)의 모든 공유 조회
   */
  findByRecipient(recipientId: string): Promise<FileShare[]>;

  /**
   * 소유자(Owner)의 모든 공유 조회
   */
  findByOwner(ownerId: string): Promise<FileShare[]>;

  /**
   * 특정 파일의 모든 공유 조회
   */
  findByFileId(fileId: string): Promise<FileShare[]>;

  /**
   * 파일+수신자로 공유 조회 (중복 공유 확인용)
   */
  findByFileAndRecipient(
    fileId: string,
    recipientId: string,
  ): Promise<FileShare | null>;

  /**
   * FileShare 삭제
   */
  delete(id: string): Promise<void>;
}

export const FILE_SHARE_REPOSITORY = Symbol('FILE_SHARE_REPOSITORY');
