/**
 * 파일 캐시 스토리지 도메인 서비스
 * FileStorageObjectEntity (CACHE 타입)의 행위를 실행하고 영속성을 보장합니다.
 *
 * DDD 관점: 캐시 스토리지 전용 도메인 서비스로, StorageType.CACHE가 이미 내재되어 있습니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  FileStorageObjectEntity,
  StorageType,
  AvailabilityStatus,
} from '../file-storage-object.entity';
import {
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../../file/repositories/file.repository.interface';
import type {
  IFileStorageObjectRepository,
} from '../../../file/repositories/file.repository.interface';

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
   * 파일 ID로 캐시 스토리지 조회 (락 획득)
   */
  async 조회ForUpdate(fileId: string): Promise<FileStorageObjectEntity | null> {
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

    return this.상태변경WithEntity(storageObject, status);
  }

  /**
   * 상태 변경 (엔티티 직접 전달)
   */
  async 상태변경WithEntity(
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

    return this.경로변경WithEntity(storageObject, newKey);
  }

  /**
   * 경로 변경 (엔티티 직접 전달)
   */
  async 경로변경WithEntity(
    storageObject: FileStorageObjectEntity,
    newKey: string,
  ): Promise<FileStorageObjectEntity> {
    storageObject.updateObjectKey(newKey);
    return this.repository.save(storageObject);
  }

  /**
   * Lease 획득 (다운로드 시작)
   */
  async Lease획득(fileId: string): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.Lease획득WithEntity(storageObject);
  }

  /**
   * Lease 획득 (엔티티 직접 전달)
   */
  async Lease획득WithEntity(storageObject: FileStorageObjectEntity): Promise<FileStorageObjectEntity> {
    storageObject.acquireLease();
    return this.repository.save(storageObject);
  }

  /**
   * Lease 해제 (다운로드 완료)
   */
  async Lease해제(fileId: string): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.Lease해제WithEntity(storageObject);
  }

  /**
   * Lease 해제 (엔티티 직접 전달)
   */
  async Lease해제WithEntity(storageObject: FileStorageObjectEntity): Promise<FileStorageObjectEntity> {
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
