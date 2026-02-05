/**
 * 파일 NAS 스토리지 도메인 서비스
 * FileStorageObjectEntity (NAS 타입)의 행위를 실행하고 영속성을 보장합니다.
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
 * NAS 스토리지 객체 생성 파라미터
 * Entity factory method와 동일: createdAt과 fileName으로 objectKey 생성
 */
export interface CreateFileNasStorageParams {
  id: string;
  fileId: string;
  /** 파일 생성 시각 (objectKey 생성에 사용) */
  createdAt: Date;
  /** 파일명 (objectKey 생성에 사용) */
  fileName: string;
  /** objectKey 직접 지정 (선택) - 지정시 createdAt/fileName 무시 */
  objectKey?: string;
  availabilityStatus?: AvailabilityStatus;
  /** SHA-256 체크섬 */
  checksum?: string;
}

@Injectable()
export class FileNasStorageDomainService {
  private readonly storageType = StorageType.NAS;

  constructor(
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly repository: IFileStorageObjectRepository,
  ) {}

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================

  /**
   * 파일 ID로 NAS 스토리지 조회
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
   * 파일 ID로 NAS 스토리지 조회 (락 획득)
   */
  async 잠금조회(fileId: string, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity | null> {
    return this.repository.findByFileIdAndTypeForUpdate(fileId, this.storageType, txOptions);
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * NAS 스토리지 객체 생성
   * Entity factory method와 동일: createdAt과 fileName으로 objectKey 자동 생성
   */
  async 생성(params: CreateFileNasStorageParams, txOptions?: TransactionOptions): Promise<FileStorageObjectEntity> {
    // objectKey가 직접 지정된 경우 그대로 사용, 아니면 Entity factory 사용
    const storageObject = params.objectKey
      ? new FileStorageObjectEntity({
          id: params.id,
          fileId: params.fileId,
          storageType: this.storageType,
          objectKey: params.objectKey,
          availabilityStatus: params.availabilityStatus ?? AvailabilityStatus.SYNCING,
          accessCount: 0,
          leaseCount: 0,
          createdAt: params.createdAt,
        })
      : FileStorageObjectEntity.createForNas({
          id: params.id,
          fileId: params.fileId,
          createdAt: params.createdAt,
          fileName: params.fileName,
        });

    // 상태 오버라이드가 필요한 경우
    if (params.availabilityStatus && params.availabilityStatus !== AvailabilityStatus.SYNCING) {
      storageObject.updateStatus(params.availabilityStatus);
    }

    // 체크섬 설정
    if (params.checksum) {
      storageObject.updateChecksum(params.checksum);
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
      throw new Error(`NAS 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
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
      throw new Error(`NAS 스토리지 객체를 찾을 수 없습니다: fileId=${fileId}`);
    }

    storageObject.updateObjectKey(newKey);
    return this.repository.save(storageObject, txOptions);
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
   * NAS 스토리지 객체 삭제
   */
  async 삭제(id: string, txOptions?: TransactionOptions): Promise<void> {
    return this.repository.delete(id, txOptions);
  }

  // ============================================
  // 일괄 작업 메서드 (Bulk Operations)
  // ============================================

  /**
   * 다수 파일의 NAS 스토리지 상태 일괄 변경
   */
  async 상태일괄변경(fileIds: string[], status: AvailabilityStatus, txOptions?: TransactionOptions): Promise<number> {
    if (fileIds.length === 0) {
      return 0;
    }
    return this.repository.updateStatusByFileIds(fileIds, this.storageType, status, txOptions);
  }
}
