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
  TransactionOptions,
} from '../repositories/file-storage-object.repository.interface';

/**
 * 캐시 스토리지 객체 생성 파라미터
 * objectKey가 없으면 fileId를 사용 (Entity factory method와 동일)
 */
export interface CreateFileCacheStorageParams {
  id: string;
  fileId: string;
  objectKey?: string;
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
  async 조회(fileId: string, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity | null> {
    return this.repository.findByFileIdAndType(fileId, this.storageType, txOptions);
  }

  /**
   * 스토리지 타입별 페이징 조회
   */
  async 스토리지타입조회(limit: number, offset: number, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity[]> {
    return this.repository.findByStorageType(this.storageType, limit, offset, txOptions);
  }

  /**
   * 랜덤 샘플 조회
   */
  async 랜덤샘플조회(count: number, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity[]> {
    return this.repository.findRandomSamples(this.storageType, count, txOptions);
  }

  /**
   * 파일 ID로 캐시 스토리지 조회 (락 획득)
   */
  async 잠금조회(fileId: string, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity | null> {
    return this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType, txOptions);
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * 캐시 스토리지 객체 생성
   * Entity factory method와 동일: objectKey가 없으면 fileId를 사용
   */
  async 생성(params: CreateFileCacheStorageParams, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    const storageObject = FileStorageObjectEntity.createForCache({
      id: params.id,
      fileId: params.fileId,
    });

    // 상태 오버라이드가 필요한 경우
    if (params.availabilityStatus && params.availabilityStatus !== AvailabilityStatus.AVAILABLE) {
      storageObject.updateStatus(params.availabilityStatus);
    }

    // objectKey 오버라이드가 필요한 경우
    if (params.objectKey && params.objectKey !== params.fileId) {
      storageObject.updateObjectKey(params.objectKey);
    }

    return this.repository.save(storageObject, txOptions);
  }

  /**
   * 엔티티 저장
   */
  async 저장(storageObject: FileStorageObjectEntity, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    return this.repository.save(storageObject, txOptions);
  }

  /**
   * 상태 변경
   */
  async 상태변경(fileId: string, status: AvailabilityStatus, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType, txOptions);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티상태변경(storageObject, status, txOptions);
  }

  /**
   * 상태 변경 (엔티티 직접 전달)
   */
  async 엔티티상태변경(
    storageObject: FileStorageObjectEntity,
    status: AvailabilityStatus,
    txOptions?: TransactionOptions,
  ): Promise<FileStorageObjectEntity> {
    storageObject.updateStatus(status);
    return this.repository.save(storageObject, txOptions);
  }

  /**
   * 경로 변경
   */
  async 경로변경(fileId: string, newKey: string, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType, txOptions);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티경로변경(storageObject, newKey, txOptions);
  }

  /**
   * 경로 변경 (엔티티 직접 전달)
   */
  async 엔티티경로변경(
    storageObject: FileStorageObjectEntity,
    newKey: string,
    txOptions?: TransactionOptions,
  ): Promise<FileStorageObjectEntity> {
    storageObject.updateObjectKey(newKey);
    return this.repository.save(storageObject, txOptions);
  }

  /**
   * 임대 획득 (다운로드 시작)
   */
  async 임대획득(fileId: string, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType, txOptions);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티임대획득(storageObject, txOptions);
  }

  /**
   * 임대 획득 (엔티티 직접 전달)
   */
  async 엔티티임대획득(storageObject: FileStorageObjectEntity, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    storageObject.acquireLease();
    return this.repository.save(storageObject, txOptions);
  }

  /**
   * 임대 해제 (다운로드 완료)
   */
  async 임대해제(fileId: string, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    const storageObject = await this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType, txOptions);
    if (!storageObject) {
      throw new Error(`캐시 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    return this.엔티티임대해제(storageObject, txOptions);
  }

  /**
   * 임대 해제 (엔티티 직접 전달)
   */
  async 엔티티임대해제(storageObject: FileStorageObjectEntity, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    storageObject.releaseLease();
    return this.repository.save(storageObject, txOptions);
  }

  /**
   * 캐시 스토리지 객체 삭제
   */
  async 삭제(id: string, txOptions?: TransactionOptions): Promise<void> {
    return this.repository.delete(id, txOptions);
  }

  // ============================================
  // 일괄 작업 메서드 (Bulk Operations)
  // ============================================

  /**
   * 다수 파일의 캐시 스토리지 상태 일괄 변경
   */
  async 상태일괄변경(fileIds: string[], status: AvailabilityStatus, txOptions?: TransactionOptions): Promise<number> {
    if (fileIds.length === 0) {
      return 0;
    }
    return this.repository.updateStatusByFileIds(fileIds, this.storageType, status, txOptions);
  }
}
