import { Injectable, Inject, NotFoundException, BadRequestException, Logger, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { parseRangeHeader, type RangeInfo } from '../../common/utils';
import {
  StorageType,
  AvailabilityStatus,
} from '../../domain/file';

import type {
  FileEntity,
  FileStorageObjectEntity,
  FileInfoResponse,
} from '../../domain/file';

/**
 * Range 다운로드 옵션
 */
export interface DownloadWithRangeOptions {
  /** HTTP Range 헤더 값 (예: "bytes=0-1023") */
  rangeHeader?: string;
  /** HTTP If-Range 헤더 값 (ETag) */
  ifRangeHeader?: string;
}

/**
 * Range 다운로드 결과
 */
export interface DownloadWithRangeResult {
  file: FileEntity;
  storageObject: FileStorageObjectEntity;
  stream: NodeJS.ReadableStream | null;
  /** 부분 응답 여부 (206 Partial Content) */
  isPartial: boolean;
  /** 적용된 Range 정보 */
  range?: RangeInfo;
  /** Range 파싱 실패 (416 Range Not Satisfiable 응답 필요) */
  isRangeInvalid?: boolean;
}
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import { JOB_QUEUE_PORT } from '../../infra/queue/job-queue.port';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IJobQueuePort } from '../../infra/queue/job-queue.port';
import { v4 as uuidv4 } from 'uuid';
import { FileQueryService } from './file-query.service';

/**
 * 파일 다운로드 비즈니스 서비스
 * 파일 다운로드 처리 (캐시 히트/미스 포함)
 * 
 * 파일 정보 조회는 FileQueryService를 사용합니다.
 */
@Injectable()
export class FileDownloadService {
  private readonly logger = new Logger(FileDownloadService.name);

  constructor(
    private readonly fileDomainService: FileDomainService,
    private readonly fileQueryService: FileQueryService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(NAS_STORAGE_PORT)
    private readonly nasStorage: INasStoragePort,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
  ) {}

  /**
   * 파일 정보 조회 (FileQueryService 위임)
   * 
   * @deprecated FileQueryService.getFileInfo()를 직접 사용하세요.
   */
  async getFileInfo(fileId: string): Promise<FileInfoResponse> {
    return this.fileQueryService.getFileInfo(fileId);
  }

  /**
   * 파일 다운로드
   * 
   * 처리 플로우:
   * 1. 파일 상태 점검 (TRASHED, DELETED 체크)
   * 2. 캐싱 여부 판단
   * 3-A. 캐시 히트: lease 획득 → 스트림 획득 → 통계 업데이트 → lease 해제
   * 3-B. 캐시 미스: NAS에서 조회 → 캐시 복원 → NAS에서 스트림 반환
   * 3-C. 둘 다 없음: 에러
   * 4. 파일 스트림 응답
   */
  async download(fileId: string): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream | null;
  }> {
    // 1. 파일 조회 및 상태 점검
    const file = await this.fileDomainService.조회(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    if (file.isTrashed()) {
      throw new BadRequestException({
        code: 'FILE_IN_TRASH',
        message: '휴지통에 있는 파일입니다.',
      });
    }

    if (file.isDeleted()) {
      throw new NotFoundException({
        code: 'FILE_DELETED',
        message: '삭제된 파일입니다.',
      });
    }

    // 3-B. 캐시 미스 - NAS에서 조회
    const nasObject = await this.fileNasStorageDomainService.조회(fileId);

    // 3-B-1. NAS 동기화 중인 경우 - 사용자에게 재시도 안내
    if (nasObject && nasObject.isSyncing()) {
      this.logger.warn(`File is syncing to NAS: ${fileId}`);
      throw new ConflictException({
        code: 'FILE_SYNCING',
        message: '파일이 NAS에 동기화 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }


    // 2. 캐시 상태 확인
    let cacheObject = await this.fileCacheStorageDomainService.조회(fileId);

    // 캐시 서버에 캐시된 파일이 존재하는지 없는지 확인
    const cacheFileExists = await this.cacheStorage.파일존재확인(fileId);

    // 케이스 1: DB 상태 AVAILABLE인데 실제 파일 없음 → 상태 보정 후 NAS 폴백
    if (cacheObject && cacheObject.isAvailable() && !cacheFileExists) {
      this.logger.warn(`Cache inconsistency: DB=AVAILABLE, file missing: ${fileId}`);
      cacheObject.updateStatus(AvailabilityStatus.MISSING);
      await this.fileCacheStorageDomainService.저장(cacheObject);
      // cacheObject를 null로 처리하여 아래 NAS 폴백 로직으로 진행
      cacheObject = null;
    }

    // 케이스 2: DB에 없거나 MISSING인데 실제 파일 있음 → 상태 복원
    if ((!cacheObject || !cacheObject.isAvailable()) && cacheFileExists) {
      this.logger.log(`Cache inconsistency: DB=MISSING/NULL, file exists: ${fileId}`);
      if (cacheObject) {
        // 기존 캐시 객체가 있으면 상태만 복원
        cacheObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileCacheStorageDomainService.저장(cacheObject);
      } else {
        // 캐시 객체가 없으면 새로 생성 (uuidv4로 ID 생성)
        const newId = uuidv4();
        cacheObject = await this.fileCacheStorageDomainService.생성({
          id: newId,
          fileId: file.id,
          objectKey: file.id,
        });
        this.logger.debug(`Created new cache object for existing file: ${fileId}`);
      }
    }

    // 3-A. 캐시 히트 (DB와 실제 파일 모두 정상인 경우)
    if (cacheObject && cacheObject.isAvailable() && cacheFileExists) {
      return this.downloadFromCache(file, cacheObject);
    }

    // 3-B-2. NAS 사용 가능 - 다운로드 진행
    if (nasObject && nasObject.isAvailable()) {
      return this.downloadFromNas(file, nasObject);
    }

    // 3-C. NAS 객체가 있지만 AVAILABLE이 아닌 경우 (ERROR, MISSING, EVICTING 등)
    if (nasObject && !nasObject.isAvailable()) {
      this.logger.error(
        `NAS storage not available for file: ${fileId}, status: ${nasObject.availabilityStatus}`,
      );
      // TODO: admin alert 전송
      throw new InternalServerErrorException({
        code: 'FILE_STORAGE_UNAVAILABLE',
        message: '파일 스토리지가 현재 사용할 수 없는 상태입니다. 관리자에게 문의하세요.',
      });
    }

    // 3-D. 둘 다 없음 (캐시 없음 + NAS 없음)
    this.logger.error(`No storage found for file: ${fileId}`);
    // TODO: admin alert 전송
    throw new InternalServerErrorException({
      code: 'FILE_NOT_FOUND_IN_STORAGE',
      message: '파일 스토리지를 찾을 수 없습니다. 관리자에게 문의하세요.',
    });
  }

  /**
   * 캐시에서 다운로드
   * 
   * 처리 플로우:
   * 1. lease 획득 (+1)
   * 2. 캐시 스토리지에서 스트림 획득
   * 3. 스트림 반환 (lease 해제는 스트림 완료 후 컨트롤러에서 처리)
   */
  private async downloadFromCache(
    file: FileEntity,
    cacheObject: FileStorageObjectEntity,
  ): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream | null;
  }> {
    // 1. lease 획득 (accessCount, lastAccessed도 함께 업데이트됨)
    cacheObject.acquireLease();
    await this.fileCacheStorageDomainService.저장(cacheObject);

    this.logger.debug(`Cache hit for file: ${file.id}, objectKey: ${cacheObject.objectKey}`);

    try {
      // 2. 캐시 스토리지에서 스트림 획득
      const stream = await this.cacheStorage.파일스트림읽기(cacheObject.objectKey);

      return {
        file,
        storageObject: cacheObject,
        stream,
      };
    } catch (error) {
      // 스트림 획득 실패 시 lease 해제
      cacheObject.releaseLease();
      await this.fileCacheStorageDomainService.저장(cacheObject);

      this.logger.error(`Failed to read from cache: ${file.id}`, error);
      throw new InternalServerErrorException({
        code: 'CACHE_READ_FAILED',
        message: '캐시에서 파일을 읽는 데 실패했습니다.',
      });
    }
  }

  /**
   * NAS에서 다운로드
   * 
   * 처리 플로우:
   * 1. lease 획득 (+1)
   * 2. NAS 스토리지에서 스트림 획득
   * 3. 백그라운드로 캐시 복원 작업 등록
   * 4. 스트림 반환 (lease 해제는 스트림 완료 후 컨트롤러에서 처리)
   */
  private async downloadFromNas(
    file: FileEntity,
    nasObject: FileStorageObjectEntity,
  ): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream | null;
  }> {
    // 1. lease 획득 (accessCount, lastAccessed도 함께 업데이트됨)
    nasObject.acquireLease();
    await this.fileNasStorageDomainService.저장(nasObject);

    this.logger.debug(`Cache miss, downloading from NAS for file: ${file.id}, objectKey: ${nasObject.objectKey}`);

    try {
      // 2. NAS 스토리지에서 스트림 획득
      const stream = await this.nasStorage.파일스트림읽기(nasObject.objectKey);

      // 3. 백그라운드로 캐시 복원 작업 등록
      // 캐시 객체가 없거나 MISSING 상태인 경우에만 복원 작업 등록
      const cacheObject = await this.fileCacheStorageDomainService.조회(file.id);

      if (!cacheObject || cacheObject.availabilityStatus === AvailabilityStatus.MISSING) {
        await this.jobQueue.addJob('CACHE_RESTORE', {
          fileId: file.id,
          nasObjectKey: nasObject.objectKey,
        });
        this.logger.debug(`Cache restore job registered for file: ${file.id}`);
      }

      return {
        file,
        storageObject: nasObject,
        stream,
      };
    } catch (error) {
      // 스트림 획득 실패 시 lease 해제
      nasObject.releaseLease();
      await this.fileNasStorageDomainService.저장(nasObject);

      this.logger.error(`Failed to read from NAS: ${file.id}`, error);
      throw new InternalServerErrorException({
        code: 'NAS_READ_FAILED',
        message: 'NAS에서 파일을 읽는 데 실패했습니다.',
      });
    }
  }

  /**
   * 파일 다운로드 (Range 지원)
   * 
   * HTTP Range Requests (RFC 7233) 지원
   * - Range 헤더 파싱, If-Range 검증을 내부에서 처리
   * - Range가 있으면 부분 스트림 반환 (206)
   * - Range가 없거나 If-Range 불일치 시 전체 스트림 반환 (200)
   * 
   * @param fileId - 파일 ID
   * @param options - Range 헤더, If-Range 헤더 (optional)
   * @returns 파일, 스토리지 객체, 스트림, 부분 요청 여부, Range 정보, 유효성
   */
  async downloadWithRange(
    fileId: string,
    options?: DownloadWithRangeOptions,
  ): Promise<DownloadWithRangeResult> {
    // 1. 파일 조회 및 상태 점검
    const file = await this.fileDomainService.조회(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    if (file.isTrashed()) {
      throw new BadRequestException({
        code: 'FILE_IN_TRASH',
        message: '휴지통에 있는 파일입니다.',
      });
    }

    if (file.isDeleted()) {
      throw new NotFoundException({
        code: 'FILE_DELETED',
        message: '삭제된 파일입니다.',
      });
    }

    // 2. Range 헤더 파싱 (파일 크기 필요)
    let range: RangeInfo | null = null;
    let isRangeInvalid = false;

    if (options?.rangeHeader) {
      range = parseRangeHeader(options.rangeHeader, file.sizeBytes);
      if (!range) {
        // Range 파싱 실패 → 416 응답 필요
        isRangeInvalid = true;
      }
    }

    // 3. NAS 상태 확인
    const nasObject = await this.fileNasStorageDomainService.조회(fileId);

    if (nasObject && nasObject.isSyncing()) {
      this.logger.warn(`File is syncing to NAS: ${fileId}`);
      throw new ConflictException({
        code: 'FILE_SYNCING',
        message: '파일이 NAS에 동기화 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }

    // 4. 캐시 상태 확인 및 보정
    let cacheObject = await this.fileCacheStorageDomainService.조회(fileId);
    const cacheFileExists = await this.cacheStorage.파일존재확인(fileId);

    // 케이스 1: DB 상태 AVAILABLE인데 실제 파일 없음
    if (cacheObject && cacheObject.isAvailable() && !cacheFileExists) {
      this.logger.warn(`Cache inconsistency: DB=AVAILABLE, file missing: ${fileId}`);
      cacheObject.updateStatus(AvailabilityStatus.MISSING);
      await this.fileCacheStorageDomainService.저장(cacheObject);
      cacheObject = null;
    }

    // 케이스 2: DB에 없거나 MISSING인데 실제 파일 있음
    if ((!cacheObject || !cacheObject.isAvailable()) && cacheFileExists) {
      this.logger.log(`Cache inconsistency: DB=MISSING/NULL, file exists: ${fileId}`);
      if (cacheObject) {
        cacheObject.updateStatus(AvailabilityStatus.AVAILABLE);
        await this.fileCacheStorageDomainService.저장(cacheObject);
      } else {
        const newId = uuidv4();
        cacheObject = await this.fileCacheStorageDomainService.생성({
          id: newId,
          fileId: file.id,
          objectKey: file.id,
        });
        this.logger.debug(`Created new cache object for existing file: ${fileId}`);
      }
    }

    // 5. 다운로드 실행 (캐시 또는 NAS)
    let result: DownloadWithRangeResult;

    if (cacheObject && cacheObject.isAvailable() && cacheFileExists) {
      result = await this.downloadFromCacheWithRange(file, cacheObject, range || undefined);
    } else if (nasObject && nasObject.isAvailable()) {
      result = await this.downloadFromNasWithRange(file, nasObject, range || undefined);
    } else if (nasObject && !nasObject.isAvailable()) {
      this.logger.error(
        `NAS storage not available for file: ${fileId}, status: ${nasObject.availabilityStatus}`,
      );
      throw new InternalServerErrorException({
        code: 'FILE_STORAGE_UNAVAILABLE',
        message: '파일 스토리지가 현재 사용할 수 없는 상태입니다. 관리자에게 문의하세요.',
      });
    } else {
      this.logger.error(`No storage found for file: ${fileId}`);
      throw new InternalServerErrorException({
        code: 'FILE_NOT_FOUND_IN_STORAGE',
        message: '파일 스토리지를 찾을 수 없습니다. 관리자에게 문의하세요.',
      });
    }

    // 6. If-Range 검증: ETag 불일치 시 전체 파일로 변경
    if (options?.ifRangeHeader && range && result.storageObject.checksum) {
      const expectedEtag = `"${result.storageObject.checksum}"`;
      if (options.ifRangeHeader !== expectedEtag) {
        this.logger.debug(
          `If-Range ETag mismatch for file ${fileId}: expected=${expectedEtag}, received=${options.ifRangeHeader}`,
        );

        // 기존 lease 해제 후 전체 파일로 다시 요청
        await this.releaseLease(fileId);

        if (cacheObject && cacheObject.isAvailable() && cacheFileExists) {
          result = await this.downloadFromCacheWithRange(file, cacheObject, undefined);
        } else if (nasObject && nasObject.isAvailable()) {
          result = await this.downloadFromNasWithRange(file, nasObject, undefined);
        }

        // 전체 파일 응답으로 변경
        result.isPartial = false;
        result.range = undefined;
      }
    }

    // Range 유효성 정보 추가
    result.isRangeInvalid = isRangeInvalid;

    return result;
  }

  /**
   * 캐시에서 다운로드 (Range 지원)
   */
  private async downloadFromCacheWithRange(
    file: FileEntity,
    cacheObject: FileStorageObjectEntity,
    range?: RangeInfo,
  ): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream | null;
    isPartial: boolean;
    range?: RangeInfo;
  }> {
    cacheObject.acquireLease();
    await this.fileCacheStorageDomainService.저장(cacheObject);

    const rangeStr = range ? `${range.start}-${range.end} (${range.end - range.start + 1} bytes)` : 'full';
    this.logger.log(`[CACHE_DOWNLOAD] 📥 file=${file.id.substring(0, 8)}... | range=${rangeStr} | objectKey=${cacheObject.objectKey}`);

    try {
      let stream: NodeJS.ReadableStream;

      if (range) {
        // Range 요청: 부분 스트림
        stream = await this.cacheStorage.파일범위스트림읽기(cacheObject.objectKey, range.start, range.end);
      } else {
        // 전체 스트림
        stream = await this.cacheStorage.파일스트림읽기(cacheObject.objectKey);
      }

      return {
        file,
        storageObject: cacheObject,
        stream,
        isPartial: !!range,
        range,
      };
    } catch (error) {
      cacheObject.releaseLease();
      await this.fileCacheStorageDomainService.저장(cacheObject);

      this.logger.error(`Failed to read from cache: ${file.id}`, error);
      throw new InternalServerErrorException({
        code: 'CACHE_READ_FAILED',
        message: '캐시에서 파일을 읽는 데 실패했습니다.',
      });
    }
  }

  /**
   * NAS에서 다운로드 (Range 지원)
   */
  private async downloadFromNasWithRange(
    file: FileEntity,
    nasObject: FileStorageObjectEntity,
    range?: RangeInfo,
  ): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream | null;
    isPartial: boolean;
    range?: RangeInfo;
  }> {
    nasObject.acquireLease();
    await this.fileNasStorageDomainService.저장(nasObject);

    const rangeStr = range ? `${range.start}-${range.end} (${range.end - range.start + 1} bytes)` : 'full';
    this.logger.log(`[NAS_DOWNLOAD] 📥 file=${file.id.substring(0, 8)}... | range=${rangeStr} | objectKey=${nasObject.objectKey}`);

    try {
      let stream: NodeJS.ReadableStream;

      if (range) {
        // Range 요청: 부분 스트림
        stream = await this.nasStorage.파일범위스트림읽기(nasObject.objectKey, range.start, range.end);
      } else {
        // 전체 스트림
        stream = await this.nasStorage.파일스트림읽기(nasObject.objectKey);
      }

      // 캐시 복원 작업 등록 (전체 다운로드 시에만)
      if (!range) {
        const cacheObject = await this.fileCacheStorageDomainService.조회(file.id);
        if (!cacheObject || cacheObject.availabilityStatus === AvailabilityStatus.MISSING) {
          await this.jobQueue.addJob('CACHE_RESTORE', {
            fileId: file.id,
            nasObjectKey: nasObject.objectKey,
          });
          this.logger.debug(`Cache restore job registered for file: ${file.id}`);
        }
      }

      return {
        file,
        storageObject: nasObject,
        stream,
        isPartial: !!range,
        range,
      };
    } catch (error) {
      nasObject.releaseLease();
      await this.fileNasStorageDomainService.저장(nasObject);

      this.logger.error(`Failed to read from NAS: ${file.id}`, error);
      throw new InternalServerErrorException({
        code: 'NAS_READ_FAILED',
        message: 'NAS에서 파일을 읽는 데 실패했습니다.',
      });
    }
  }

  /**
   * 다운로드 완료 후 lease 해제
   * 
   * 스트림 종료 시 (성공/실패/중단 모두) 반드시 호출되어야 합니다.
   * - stream.on('close') / stream.on('error') / stream.on('end') 이벤트에서 호출
   * - leaseCount는 0 미만이 되지 않도록 보장됨 (엔티티에서 처리)
   * 
   * @param fileId - 파일 ID
   * @param storageType - 스토리지 타입 (지정하지 않으면 캐시, NAS 순으로 확인)
   */
  async releaseLease(fileId: string, storageType?: StorageType): Promise<void> {
    try {
      // 특정 스토리지 타입이 지정된 경우
      if (storageType === StorageType.CACHE) {
        const storageObject = await this.fileCacheStorageDomainService.조회(fileId);
        if (storageObject && storageObject.leaseCount > 0) {
          storageObject.releaseLease();
          await this.fileCacheStorageDomainService.저장(storageObject);
          this.logger.debug(`Lease released for file: ${fileId}, storage: CACHE`);
        }
        return;
      }

      if (storageType === StorageType.NAS) {
        const storageObject = await this.fileNasStorageDomainService.조회(fileId);
        if (storageObject && storageObject.leaseCount > 0) {
          storageObject.releaseLease();
          await this.fileNasStorageDomainService.저장(storageObject);
          this.logger.debug(`Lease released for file: ${fileId}, storage: NAS`);
        }
        return;
      }

      // 스토리지 타입이 지정되지 않은 경우 - leaseCount가 있는 스토리지에서 해제
      const cacheObject = await this.fileCacheStorageDomainService.조회(fileId);

      if (cacheObject && cacheObject.leaseCount > 0) {
        cacheObject.releaseLease();
        await this.fileCacheStorageDomainService.저장(cacheObject);
        this.logger.debug(`Lease released for file: ${fileId}, storage: CACHE`);
        return;
      }

      const nasObject = await this.fileNasStorageDomainService.조회(fileId);

      if (nasObject && nasObject.leaseCount > 0) {
        nasObject.releaseLease();
        await this.fileNasStorageDomainService.저장(nasObject);
        this.logger.debug(`Lease released for file: ${fileId}, storage: NAS`);
      }
    } catch (error) {
      // lease 해제 실패는 로깅만 하고 에러를 전파하지 않음
      this.logger.error(`Failed to release lease for file: ${fileId}`, error);
    }
  }
}
