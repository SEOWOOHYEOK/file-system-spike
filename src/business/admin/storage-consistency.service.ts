/**
 * Admin Storage Consistency 도메인 서비스
 * DB와 실제 스토리지 간의 일관성을 검증합니다.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CACHE_STORAGE_PORT,
} from '../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
} from '../../domain/storage/ports/nas-storage.port';
import {
  StorageType,
  FileStorageObjectEntity,
} from '../../domain/storage/file/entity/file-storage-object.entity';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import { FileDomainService } from '../../domain/file';
import {
  FileCacheStorageDomainService,
  FileNasStorageDomainService,
} from '../../domain/storage';

/**
 * 일관성 이슈 타입
 */
export type ConsistencyIssueType =
  | 'DB_ONLY'      // DB에만 있고 스토리지에 없음
  | 'ORPHAN'       // 스토리지 객체만 있고 파일 레코드 없음
  | 'SIZE_MISMATCH' // DB 크기와 실제 파일 크기 불일치
  | 'ERROR';       // 스토리지 접근 오류

/**
 * 일관성 이슈 정보
 */
export interface ConsistencyIssue {
  fileId: string;
  fileName: string;
  issueType: ConsistencyIssueType;
  storageType: StorageType;
  description: string;
  storageObject?: {
    id: string;
    objectKey: string;
    availabilityStatus: string;
  };
  dbSize?: number;
  actualSize?: number;
}

/**
 * 일관성 검증 결과
 */
export interface StorageConsistencyResult {
  totalChecked: number;
  inconsistencies: number;
  issues: ConsistencyIssue[];
  checkedAt: Date;
}

/**
 * 일관성 검증 파라미터
 */
export interface ConsistencyCheckParams {
  storageType?: StorageType;
  limit: number;
  offset: number;
  sample?: boolean;
}

@Injectable()
export class StorageConsistencyService {
  private readonly logger = new Logger(StorageConsistencyService.name);

  constructor(
    private readonly fileDomainService: FileDomainService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
  ) {}

  /**
   * 스토리지 일관성 검증
   * @param params 검증 파라미터
   * @returns 검증 결과
   */
  async checkConsistency(params: ConsistencyCheckParams): Promise<StorageConsistencyResult> {
    const storageTypes = params.storageType
      ? [params.storageType]
      : [StorageType.CACHE, StorageType.NAS];

    const allIssues: ConsistencyIssue[] = [];
    let totalChecked = 0;

    for (const storageType of storageTypes) {
      const storageService = this.getStorageDomainService(storageType);
      const storageObjects = params.sample
        ? await storageService.랜덤샘플조회(params.limit)
        : await storageService.스토리지타입조회(params.limit, params.offset);

      totalChecked += storageObjects.length;

      for (const storageObject of storageObjects) {
        const issues = await this.checkSingleFileConsistency(storageObject, storageType);
        allIssues.push(...issues);
      }
    }

    return {
      totalChecked,
      inconsistencies: allIssues.length,
      issues: allIssues,
      checkedAt: new Date(),
    };
  }

  /**
   * 단일 파일의 일관성 검증
   */
  private async checkSingleFileConsistency(
    storageObject: FileStorageObjectEntity,
    storageType: StorageType,
  ): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = [];

    // 1. 파일 레코드 조회
    const file = await this.fileDomainService.조회(storageObject.fileId);
    if (!file) {
      issues.push({
        fileId: storageObject.fileId,
        fileName: 'Unknown',
        issueType: 'ORPHAN',
        storageType,
        description: '스토리지 객체만 있고 파일 레코드가 없음 (고아 객체)',
        storageObject: {
          id: storageObject.id,
          objectKey: storageObject.objectKey,
          availabilityStatus: storageObject.availabilityStatus,
        },
      });
      return issues;
    }

    // 2. 실제 스토리지 확인
    try {
      const exists = await this.checkStorageExists(storageObject.objectKey, storageType);

      if (!exists) {
        issues.push({
          fileId: file.id,
          fileName: file.name,
          issueType: 'DB_ONLY',
          storageType,
          description: 'DB에만 존재하고 실제 스토리지에 없음',
          storageObject: {
            id: storageObject.id,
            objectKey: storageObject.objectKey,
            availabilityStatus: storageObject.availabilityStatus,
          },
        });
        return issues;
      }

      // 3. 크기 비교
      const actualSize = await this.getStorageFileSize(storageObject.objectKey, storageType);
      if (actualSize !== file.sizeBytes) {
        issues.push({
          fileId: file.id,
          fileName: file.name,
          issueType: 'SIZE_MISMATCH',
          storageType,
          description: `DB 크기(${file.sizeBytes})와 실제 파일 크기(${actualSize}) 불일치`,
          storageObject: {
            id: storageObject.id,
            objectKey: storageObject.objectKey,
            availabilityStatus: storageObject.availabilityStatus,
          },
          dbSize: file.sizeBytes,
          actualSize,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`스토리지 확인 실패: ${storageObject.objectKey}: ${errorMessage}`);
      issues.push({
        fileId: file.id,
        fileName: file.name,
        issueType: 'ERROR',
        storageType,
        description: `스토리지 확인 중 오류: ${errorMessage}`,
        storageObject: {
          id: storageObject.id,
          objectKey: storageObject.objectKey,
          availabilityStatus: storageObject.availabilityStatus,
        },
      });
    }

    return issues;
  }

  /**
   * 스토리지에 파일 존재 확인
   */
  private async checkStorageExists(objectKey: string, storageType: StorageType): Promise<boolean> {
    if (storageType === StorageType.CACHE) {
      return this.cacheStorage.파일존재확인(objectKey);
    } else {
      return this.nasStorage.존재확인(objectKey);
    }
  }

  /**
   * 스토리지에서 파일 크기 조회
   */
  private async getStorageFileSize(objectKey: string, storageType: StorageType): Promise<number> {
    if (storageType === StorageType.CACHE) {
      return this.cacheStorage.파일크기조회(objectKey);
    } else {
      return this.nasStorage.파일크기조회(objectKey);
    }
  }

  private getStorageDomainService(
    storageType: StorageType,
  ): FileCacheStorageDomainService | FileNasStorageDomainService {
    return storageType === StorageType.CACHE
      ? this.fileCacheStorageDomainService
      : this.fileNasStorageDomainService;
  }
}
