/**
 * 파일 캐시 스토리지 도메인 서비스
 * FileStorageObjectEntity (CACHE 타입)의 행위를 실행하고 영속성을 보장합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  FileStorageObjectEntity,
  StorageType,
  AvailabilityStatus,
} from '../entity/file-storage-object.entity';
import {
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../repositories/file-storage-object.repository.interface';
import type {
  IFileStorageObjectRepository,
} from '../repositories/file-storage-object.repository.interface';

/**
 * 캐시 스토리지 객체 생성 파라미터
 */
export interface CreateFileCacheStorageParams {
  id: string;
  fileId: string;
  objectKey: string;
  availabilityStatus?: AvailabilityStatus;
}

@Injectable()
export class FileCacheStorageDomainService {
  private readonly storageType = StorageType.CACHE;

  constructor(
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly repository: IFileStorageObjectRepository,
  ) {}

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================

  /**
   * 파일 ID로 캐시 스토리지 조회
   */
  async 조회(fileId: string): Promise<FileStorageObjectEntity | null> {
    return this.repository.findByFileIdAndType(fileId, this.storageType);
  }

  /**
   * 스토리지 타입별 페이징 조회
   */
  async 스토리지타입조회(limit: number, offset: number): Promise<FileStorageObjectEntity[]> {
    return this.repository.findByStorageType(this.storageType, limit, offset);
  }

  /**
   * 랜덤 샘플 조회
   */
  async 랜덤샘플조회(count: number): Promise<FileStorageObjectEntity[]> {
    return this.repository.findRandomSamples(this.storageType, count);
  }

  /**
   * 파일 ID로 캐시 스토리지 조회 (락 획득)
   */
  async 잠금조회(fileId: string): Promise<FileStorageObjectEntity | null> {
    return this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType);
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * 캐시 스토리지 객체 생성
   */
  async 생성(params: CreateFileCacheStorageParams): Promise<FileStorageObjectEntity> {
    const storageObject = new FileStorageObjectEntity({
      id: params.id,
      fileId: params.fileId,
      storageType: this.storageType,
      objectKey: params.objectKey,
      availabilityStatus: params.availabilityStatus ?? AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });

    return this.repository.save(storageObject);
  }

  /**
   * 상태 변경
   */
  async 상태변경(fileId: string, status: AvailabilityStatus): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티상태변경(storageObject, status);
  }

  /**
   * 상태 변경 (엔티티 직접 전달)
   */
  async 엔티티상태변경(
    storageObject: FileStorageObjectEntity,
    status: AvailabilityStatus,
  ): Promise<FileStorageObjectEntity> {
    storageObject.updateStatus(status);
    return this.repository.save(storageObject);
  }

  /**
   * 경로 변경
   */
  async 경로변경(fileId: string, newKey: string): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티경로변경(storageObject, newKey);
  }

  /**
   * 경로 변경 (엔티티 직접 전달)
   */
  async 엔티티경로변경(
    storageObject: FileStorageObjectEntity,
    newKey: string,
  ): Promise<FileStorageObjectEntity> {
    storageObject.updateObjectKey(newKey);
    return this.repository.save(storageObject);
  }

  /**
   * 임대 획득 (다운로드 시작)
   */
  async 임대획득(fileId: string): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티임대획득(storageObject);
  }

  /**
   * 임대 획득 (엔티티 직접 전달)
   */
  async 엔티티임대획득(storageObject: FileStorageObjectEntity): Promise<FileStorageObjectEntity> {
    storageObject.acquireLease();
    return this.repository.save(storageObject);
  }

  /**
   * 임대 해제 (다운로드 완료)
   */
  async 임대해제(fileId: string): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티임대해제(storageObject);
  }

  /**
   * 임대 해제 (엔티티 직접 전달)
   */
  async 엔티티임대해제(storageObject: FileStorageObjectEntity): Promise<FileStorageObjectEntity> {
    storageObject.releaseLease();
    return this.repository.save(storageObject);
  }

  /**
   * 캐시 스토리지 객체 삭제
   */
  async 삭제(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  // ============================================
  // 일괄 작업 메서드 (Bulk Operations)
  // ============================================

  /**
   * 다수 파일의 캐시 스토리지 상태 일괄 변경
   */
  async 상태일괄변경(fileIds: string[], status: AvailabilityStatus): Promise<number> {
    if (fileIds.length === 0) {
      return 0;
    }
    return this.repository.updateStatusByFileIds(fileIds, this.storageType, status);
  }
}
