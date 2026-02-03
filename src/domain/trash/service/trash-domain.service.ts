/**
 * 휴지통 도메인 서비스
 * TrashMetadataEntity의 행위를 실행하고 영속성을 보장합니다.
 *
 * DDD 관점: 도메인 서비스는 엔티티 행위 호출 후 Repository를 통해 변경사항을 영속화합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  TrashMetadataEntity,
  TrashMetadataFactory,
  TrashItemType,
} from '../entities/trash-metadata.entity';
import { TRASH_REPOSITORY, TRASH_QUERY_SERVICE } from '../repositories/trash.repository.interface';
import type { ITrashRepository, ITrashQueryService } from '../repositories/trash.repository.interface';

/**
 * 파일 휴지통 메타데이터 생성 파라미터
 */
export interface CreateFileTrashParams {
  id: string;
  fileId: string;
  originalPath: string;
  originalFolderId: string;
  deletedBy: string;
  retentionDays?: number;
}

/**
 * 폴더 휴지통 메타데이터 생성 파라미터
 */
export interface CreateFolderTrashParams {
  id: string;
  folderId: string;
  originalPath: string;
  originalParentId: string | null;
  deletedBy: string;
  retentionDays?: number;
}

@Injectable()
export class TrashDomainService {
  constructor(
    @Inject(TRASH_REPOSITORY)
    private readonly trashRepository: ITrashRepository,
    @Inject(TRASH_QUERY_SERVICE)
    private readonly trashQueryService: ITrashQueryService,
  ) {}

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================

  /**
   * ID로 휴지통 메타데이터 조회
   */
  async 조회(id: string): Promise<TrashMetadataEntity | null> {
    return this.trashRepository.findById(id);
  }

  /**
   * 파일 ID로 휴지통 메타데이터 조회
   */
  async 파일메타조회(fileId: string): Promise<TrashMetadataEntity | null> {
    return this.trashRepository.findByFileId(fileId);
  }

  /**
   * 폴더 ID로 휴지통 메타데이터 조회
   */
  async 폴더메타조회(folderId: string): Promise<TrashMetadataEntity | null> {
    return this.trashRepository.findByFolderId(folderId);
  }

  /**
   * 전체 휴지통 목록 조회
   */
  async 전체목록조회(options?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<TrashMetadataEntity[]> {
    return this.trashRepository.findAll(options);
  }

  /**
   * 휴지통 아이템 수 조회
   */
  async 아이템수조회(): Promise<number> {
    return this.trashRepository.count();
  }

  /**
   * 휴지통 목록 조회 (파일/폴더 정보 포함)
   * 복잡한 조인 쿼리를 사용하여 상세 정보를 조회합니다.
   */
  async 상세목록조회(options?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<{
      type: TrashItemType;
      id: string;
      name: string;
      sizeBytes?: number;
      mimeType?: string;
      trashMetadataId: string;
      originalPath: string;
      deletedAt: Date;
      deletedBy: string;
      modifiedAt: Date;
      expiresAt: Date;
    }>;
    totalCount: number;
    totalSizeBytes: number;
  }> {
    return this.trashQueryService.getTrashList(options);
  }

  /**
   * 만료된 아이템 조회
   */
  async 만료아이템조회(limit?: number): Promise<TrashMetadataEntity[]> {
    return this.trashRepository.findExpired(limit);
  }

  /**
   * 휴지통 전체 크기 조회
   */
  async 전체크기조회(): Promise<number> {
    return this.trashRepository.getTotalSize();
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * 파일 휴지통 메타데이터 생성
   * 파일이 삭제될 때 복원 정보를 저장합니다.
   *
   * @param params - 파일 휴지통 생성 파라미터
   * @returns 생성된 휴지통 메타데이터
   */
  async 파일메타생성(params: CreateFileTrashParams): Promise<TrashMetadataEntity> {
    const trashMetadata = TrashMetadataFactory.createForFile({
      id: params.id,
      fileId: params.fileId,
      originalPath: params.originalPath,
      originalFolderId: params.originalFolderId,
      deletedBy: params.deletedBy,
      retentionDays: params.retentionDays,
    });

    return this.trashRepository.save(trashMetadata);
  }

  /**
   * 폴더 휴지통 메타데이터 생성
   * 폴더가 삭제될 때 복원 정보를 저장합니다.
   *
   * @param params - 폴더 휴지통 생성 파라미터
   * @returns 생성된 휴지통 메타데이터
   */
  async 폴더메타생성(params: CreateFolderTrashParams): Promise<TrashMetadataEntity> {
    const trashMetadata = TrashMetadataFactory.createForFolder({
      id: params.id,
      folderId: params.folderId,
      originalPath: params.originalPath,
      originalParentId: params.originalParentId,
      deletedBy: params.deletedBy,
      retentionDays: params.retentionDays,
    });

    return this.trashRepository.save(trashMetadata);
  }

  /**
   * 휴지통 메타데이터 삭제 (복원 시)
   * 아이템이 복원되면 휴지통 메타데이터를 삭제합니다.
   *
   * @param id - 휴지통 메타데이터 ID
   */
  async 삭제(id: string): Promise<void> {
    return this.trashRepository.delete(id);
  }

  /**
   * 파일 ID로 휴지통 메타데이터 삭제
   *
   * @param fileId - 파일 ID
   */
  async 파일메타삭제(fileId: string): Promise<void> {
    return this.trashRepository.deleteByFileId(fileId);
  }

  /**
   * 폴더 ID로 휴지통 메타데이터 삭제
   *
   * @param folderId - 폴더 ID
   */
  async 폴더메타삭제(folderId: string): Promise<void> {
    return this.trashRepository.deleteByFolderId(folderId);
  }

  /**
   * 만료일 연장
   * 엔티티의 extendExpiry 행위를 실행하고 영속화합니다.
   *
   * @param id - 휴지통 메타데이터 ID
   * @param days - 연장할 일수
   * @returns 업데이트된 휴지통 메타데이터
   */
  async 만료일연장(id: string, days: number): Promise<TrashMetadataEntity> {
    const trashMetadata = await this.trashRepository.findById(id);
    if (!trashMetadata) {
      throw new Error(`휴지통 메타데이터를 찾을 수 없습니다: ${id}`);
    }

    // 엔티티 행위 실행
    trashMetadata.extendExpiry(days);

    // 영속화
    return this.trashRepository.save(trashMetadata);
  }

  /**
   * 휴지통 비우기
   * 모든 휴지통 메타데이터를 삭제합니다.
   *
   * @returns 삭제된 아이템 수
   */
  async 전체비우기(): Promise<number> {
    return this.trashRepository.deleteAll();
  }

  // ============================================
  // 유틸리티 메서드
  // ============================================

  /**
   * 아이템 타입별 조회
   *
   * @param id - 휴지통 메타데이터 ID
   * @returns 아이템 타입
   */
  async 아이템타입조회(id: string): Promise<TrashItemType | null> {
    const trashMetadata = await this.trashRepository.findById(id);
    return trashMetadata ? trashMetadata.getItemType() : null;
  }

  /**
   * 만료 여부 확인
   *
   * @param id - 휴지통 메타데이터 ID
   * @returns 만료 여부
   */
  async 만료여부확인(id: string): Promise<boolean> {
    const trashMetadata = await this.trashRepository.findById(id);
    if (!trashMetadata) {
      throw new Error(`휴지통 메타데이터를 찾을 수 없습니다: ${id}`);
    }
    return trashMetadata.isExpired();
  }
}
