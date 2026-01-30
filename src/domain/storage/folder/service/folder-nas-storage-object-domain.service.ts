/**
 * 폴더 스토리지 객체 도메인 서비스
 * FolderStorageObjectEntity의 행위를 실행하고 영속성을 보장합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  FolderStorageObjectEntity,
  FolderAvailabilityStatus,
} from '../folder-storage-object.entity';
import {
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../repositories/folder-storage-object.repository.interface';
import type {
  IFolderStorageObjectRepository,
} from '../repositories/folder-storage-object.repository.interface';

/**
 * 폴더 스토리지 객체 생성 파라미터
 */
export interface CreateFolderStorageObjectParams {
  id: string;
  folderId: string;
  objectKey: string;
  availabilityStatus?: FolderAvailabilityStatus;
}

@Injectable()
export class FolderNasStorageObjectDomainService {
  constructor(
    @Inject(FOLDER_STORAGE_OBJECT_REPOSITORY)
    private readonly repository: IFolderStorageObjectRepository,
  ) { }

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================

  /**
   * 폴더 ID로 조회
   */
  async 조회(folderId: string): Promise<FolderStorageObjectEntity | null> {
    return this.repository.findByFolderId(folderId);
  }

  /**
   * 폴더 ID로 조회 (락 획득)
   */
  async 잠금조회(folderId: string): Promise<FolderStorageObjectEntity | null> {
    return this.repository.findByFolderIdForUpdate(folderId);
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * 스토리지 객체 생성
   * 새 스토리지 객체 엔티티를 생성하고 영속화합니다.
   *
   * @param params - 생성 파라미터
   * @returns 생성된 스토리지 객체 엔티티
   */
  async 생성(params: CreateFolderStorageObjectParams): Promise<FolderStorageObjectEntity> {
    const storageObject = new FolderStorageObjectEntity({
      id: params.id,
      folderId: params.folderId,
      storageType: 'NAS',
      objectKey: params.objectKey,
      availabilityStatus: params.availabilityStatus ?? FolderAvailabilityStatus.SYNCING,
      createdAt: new Date(),
    });

    return this.repository.save(storageObject);
  }

  /**
   * 상태 변경
   * 엔티티의 updateStatus 행위를 실행하고 변경사항을 영속화합니다.
   *
   * @param folderId - 폴더 ID
   * @param status - 새 상태
   * @returns 업데이트된 스토리지 객체 엔티티
   */
  async 상태변경(
    folderId: string,
    status: FolderAvailabilityStatus,
  ): Promise<FolderStorageObjectEntity> {
    const storageObject = await this.repository.findByFolderIdForUpdate(folderId);
    if (!storageObject) {
      throw new Error(`스토리지 객체를 찾을 수 없습니다: folderId=${folderId}`);
    }

    storageObject.updateStatus(status);
    return this.repository.save(storageObject);
  }

  /**
   * 경로 변경
   * 엔티티의 updateObjectKey 행위를 실행하고 변경사항을 영속화합니다.
   *
   * @param folderId - 폴더 ID
   * @param newKey - 새 경로
   * @returns 업데이트된 스토리지 객체 엔티티
   */
  async 경로변경(folderId: string, newKey: string): Promise<FolderStorageObjectEntity> {
    const storageObject = await this.repository.findByFolderIdForUpdate(folderId);
    if (!storageObject) {
      throw new Error(`스토리지 객체를 찾을 수 없습니다: folderId=${folderId}`);
    }

    storageObject.updateObjectKey(newKey);
    return this.repository.save(storageObject);
  }

  /**
   * 상태 및 경로 동시 변경
   *
   * @param folderId - 폴더 ID
   * @param status - 새 상태
   * @param newKey - 새 경로
   * @returns 업데이트된 스토리지 객체 엔티티
   */
  async 상태및경로변경(
    folderId: string,
    status: FolderAvailabilityStatus,
    newKey: string,
  ): Promise<FolderStorageObjectEntity> {
    const storageObject = await this.repository.findByFolderIdForUpdate(folderId);
    if (!storageObject) {
      throw new Error(`스토리지 객체를 찾을 수 없습니다: folderId=${folderId}`);
    }

    storageObject.updateStatus(status);
    storageObject.updateObjectKey(newKey);
    return this.repository.save(storageObject);
  }

  /**
   * 스토리지 객체 삭제
   *
   * @param id - 스토리지 객체 ID
   */
  async 삭제(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  /**
   * 폴더 ID로 스토리지 객체 삭제
   *
   * @param folderId - 폴더 ID
   */
  async 폴더별삭제(folderId: string): Promise<void> {
    return this.repository.deleteByFolderId(folderId);
  }

  // ============================================
  // 일괄 작업 메서드 (Bulk Operations)
  // ============================================

  /**
   * 다수 폴더의 스토리지 상태 일괄 변경
   *
   * @param folderIds - 폴더 ID 목록
   * @param status - 변경할 상태
   * @returns 영향받은 스토리지 객체 수
   */
  async 상태일괄변경(
    folderIds: string[],
    status: FolderAvailabilityStatus,
  ): Promise<number> {
    if (folderIds.length === 0) {
      return 0;
    }
    return this.repository.updateStatusByFolderIds(folderIds, status);
  }
}
