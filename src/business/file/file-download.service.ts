import { Injectable, Inject, NotFoundException, BadRequestException, Logger, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { parseRangeHeader, formatContentRange, createByteCountingStream, type RangeInfo } from '../../common/utils';
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

/**
 * 다운로드 준비 응답
 *
 * 컨트롤러가 Express Response에 바로 적용할 수 있도록
 * 상태코드, 헤더, 스트림을 모두 포함한 결과.
 */
export interface PreparedDownloadResponse {
  /** HTTP 상태코드 (200 | 206 | 416) */
  statusCode: number;
  /** HTTP 응답 헤더 */
  headers: Record<string, string | number>;
  /** 파일 스트림 (416인 경우 null) */
  stream: NodeJS.ReadableStream | null;
  /** 파일 ID (lease 해제용) */
  fileId: string;
}

import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { UploadSessionDomainService } from '../../domain/upload-session/service/upload-session-domain.service';
import { UploadSessionStatus } from '../../domain/upload-session';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { INasStoragePort } from '../../domain/storage/ports/nas-storage.port';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
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
    private readonly uploadSessionDomainService: UploadSessionDomainService,
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

    // 3-B-1. NAS 동기화 중인 경우 - 멀티파트 파트 조립 다운로드 시도
    if (nasObject && nasObject.isSyncing()) {
      const completingSession = await this.findCompletingSession(fileId);
      if (completingSession) {
        this.logger.log(`Serving download from multipart parts: ${fileId}`);
        return this.downloadFromParts(file, nasObject, completingSession.id);
      }
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
        }, {
          jobId: `cache-restore:${file.id}`,
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
      const completingSession = await this.findCompletingSession(fileId);
      if (completingSession) {
        this.logger.log(`Serving range download from multipart parts: ${fileId}`);
        if (range) {
          return this.downloadFromPartsWithRange(file, nasObject, completingSession.id, range);
        }
        // Range 없으면 전체 다운로드
        const fullResult = await this.downloadFromParts(file, nasObject, completingSession.id);
        return { ...fullResult, isPartial: false };
      }
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
   * 다운로드 준비 (컨트롤러용)
   *
   * downloadWithRange()를 호출한 뒤 HTTP 응답에 필요한 상태코드,
   * 헤더, 스트림(바이트 카운팅 래핑 포함)을 조합하여 반환한다.
   * 컨트롤러는 이 결과를 Express Response에 그대로 적용하면 된다.
   *
   * @param fileId - 파일 ID
   * @param options - Range/If-Range 헤더
   * @returns PreparedDownloadResponse
   */
  async prepareDownload(
    fileId: string,
    options?: DownloadWithRangeOptions,
  ): Promise<PreparedDownloadResponse> {
    const { file, storageObject, stream, isPartial, range, isRangeInvalid } =
      await this.downloadWithRange(fileId, options);

    // ── 416 Range Not Satisfiable ──
    if (isRangeInvalid) {
      this.logger.warn(
        `Range 요청 범위 초과: fileId=${fileId}, sizeBytes=${file.sizeBytes}, rangeHeader=${options?.rangeHeader}`,
      );
      return {
        statusCode: 416,
        headers: { 'Content-Range': `bytes */${file.sizeBytes}` },
        stream: null,
        fileId,
      };
    }

    // ── 공통 헤더 ──
    const headers: Record<string, string | number> = {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Accept-Ranges': 'bytes',
    };

    if (storageObject.checksum) {
      headers['ETag'] = `"${storageObject.checksum}"`;
    }

    headers['Last-Modified'] = file.updatedAt.toUTCString();

    if (storageObject.checksum && !isPartial) {
      headers['X-Checksum-SHA256'] = storageObject.checksum;
    }

    // ── 상태코드 + Range 헤더 ──
    let statusCode: number;
    if (isPartial && range) {
      statusCode = 206;
      headers['Content-Range'] = formatContentRange(range.start, range.end, file.sizeBytes);
      headers['Content-Length'] = range.end - range.start + 1;
    } else {
      statusCode = 200;
      headers['Content-Length'] = file.sizeBytes;
    }

    // ── 바이트 카운팅 스트림 래핑 ──
    let outStream: NodeJS.ReadableStream | null = null;
    if (stream) {
      const expectedSize = isPartial && range
        ? range.end - range.start + 1
        : file.sizeBytes;
      const rangeInfo = range ? `${range.start}-${range.end}` : 'full';
      const countingStream = createByteCountingStream(
        expectedSize,
        this.logger,
        fileId,
        rangeInfo,
      );
      (stream as NodeJS.ReadableStream & { pipe: Function }).pipe(countingStream);
      outStream = countingStream;
    }

    return { statusCode, headers, stream: outStream, fileId };
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
    this.logger.log(`[NAS_FILE_RA_DOWNLOAD] 📥 file=${file.id.substring(0, 8)}... | range=${rangeStr} | objectKey=${nasObject.objectKey}`);

    try {
      let stream: NodeJS.ReadableStream;

      if (range) {
        // Range 요청: 부분 스트림
        stream = await this.nasStorage.파일범위스트림읽기(nasObject.objectKey, range.start, range.end);
      } else {
        // 전체 스트림
        stream = await this.nasStorage.파일스트림읽기(nasObject.objectKey);
      }

      // 캐시 복원 작업 등록 (Range 요청 포함 - 워커가 전체 파일을 NAS에서 캐시로 복사)
      const cacheObject = await this.fileCacheStorageDomainService.조회(file.id);
      if (!cacheObject || cacheObject.availabilityStatus === AvailabilityStatus.MISSING) {
        await this.jobQueue.addJob('CACHE_RESTORE', {
          fileId: file.id,
          nasObjectKey: nasObject.objectKey,
        }, {
          jobId: `cache-restore:${file.id}`,
        });
        this.logger.debug(`Cache restore job registered for file: ${file.id}`);
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

  // ── 미리보기 가능한 MIME 타입 ──
  private static readonly PREVIEWABLE_MIME_TYPES = new Set([
    // 이미지
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon',
    // PDF
    'application/pdf',
    // 비디오
    'video/mp4', 'video/webm',
    // 오디오
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    // 텍스트
    'text/plain', 'text/html', 'text/css', 'text/csv',
    'application/json', 'application/xml', 'application/javascript',
  ]);

  /**
   * 파일 미리보기 준비 (컨트롤러용)
   *
   * prepareDownload()와 동일하지만 Content-Disposition을 `inline`으로 설정하여
   * 브라우저가 파일을 직접 표시(렌더링)할 수 있게 합니다.
   *
   * - 미리보기 가능한 MIME 타입: inline → 브라우저가 직접 렌더링
   * - 미리보기 불가 MIME 타입: attachment → 다운로드 폴백
   *
   * 클라이언트 사용 예시:
   * - 이미지: <img src="/v1/files/{fileId}/preview" />
   * - PDF:   <iframe src="/v1/files/{fileId}/preview" />
   * - 비디오: <video src="/v1/files/{fileId}/preview" controls />
   * - 오디오: <audio src="/v1/files/{fileId}/preview" controls />
   *
   * @param fileId - 파일 ID
   * @param options - Range/If-Range 헤더 (optional)
   * @returns PreparedDownloadResponse (Content-Disposition: inline)
   */
  async preparePreview(
    fileId: string,
    options?: DownloadWithRangeOptions,
  ): Promise<PreparedDownloadResponse> {
    const result = await this.prepareDownload(fileId, options);

    // stream이 null이면 (416 등) 그대로 반환
    if (!result.stream) {
      return result;
    }

    // MIME 타입 확인 후 inline/attachment 결정
    const contentType = result.headers['Content-Type'] as string;
    const isPreviewable = FileDownloadService.PREVIEWABLE_MIME_TYPES.has(contentType);

    if (isPreviewable) {
      // 브라우저가 직접 렌더링하도록 inline 설정
      const filename = this.extractFilenameFromHeader(result.headers['Content-Disposition'] as string);
      result.headers['Content-Disposition'] = `inline; filename*=UTF-8''${filename}`;
    }
    // 미리보기 불가능한 타입은 기존 attachment 유지 (다운로드 폴백)

    // 브라우저 캐싱 허용 (미리보기는 반복 요청이 잦음)
    result.headers['Cache-Control'] = 'private, max-age=3600';

    return result;
  }

  /**
   * Content-Disposition 헤더에서 파일명 추출
   */
  private extractFilenameFromHeader(disposition: string): string {
    const match = disposition?.match(/filename\*=UTF-8''(.+)/);
    return match ? match[1] : 'file';
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

  // ============================================
  // 멀티파트 파트 기반 다운로드 (NAS sync 중)
  // ============================================

  /**
   * COMPLETING 상태인 멀티파트 세션 조회
   * NAS sync 중 다운로드 시 파트에서 직접 조립하기 위해 사용
   */
  private async findCompletingSession(fileId: string) {
    const sessions = await this.uploadSessionDomainService.세션목록조회({
      fileId,
      status: [UploadSessionStatus.COMPLETING],
      limit: 1,
    });
    return sessions[0] || null;
  }

  /**
   * 파트에서 전체 파일 스트림 조립 (다운로드용)
   * NAS sync 중 다운로드 요청 시 사용
   */
  private async downloadFromParts(
    file: FileEntity,
    storageObject: FileStorageObjectEntity,
    sessionId: string,
  ): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream;
  }> {
    const parts = await this.uploadSessionDomainService.완료파트목록조회(sessionId);
    const sorted = parts.sort((a, b) => a.partNumber - b.partNumber);

    const passThrough = new PassThrough();

    // 파트를 순차적으로 파이프 (비동기)
    (async () => {
      for (const part of sorted) {
        if (!part.objectKey) continue;
        const partStream = await this.cacheStorage.파일스트림읽기(part.objectKey);
        await pipeline(partStream, passThrough, { end: false });
      }
      passThrough.end();
    })().catch(err => passThrough.destroy(err));

    return { file, storageObject, stream: passThrough };
  }

  /**
   * 파트에서 Range 다운로드 (부분 응답)
   * 파트 크기 기반으로 바이트 → 파트 매핑
   */
  private async downloadFromPartsWithRange(
    file: FileEntity,
    storageObject: FileStorageObjectEntity,
    sessionId: string,
    range: RangeInfo,
  ): Promise<DownloadWithRangeResult> {
    const parts = await this.uploadSessionDomainService.완료파트목록조회(sessionId);
    const sorted = parts.sort((a, b) => a.partNumber - b.partNumber);
    const partSize = sorted[0]?.size || (10 * 1024 * 1024);

    const startPart = Math.floor(range.start / partSize);
    const endPart = Math.floor(range.end / partSize);
    const relevant = sorted.slice(startPart, endPart + 1);

    const passThrough = new PassThrough();

    (async () => {
      for (let i = 0; i < relevant.length; i++) {
        const part = relevant[i];
        if (!part.objectKey) continue;

        const partOffset = (startPart + i) * partSize;
        const readStart = Math.max(range.start - partOffset, 0);
        const readEnd = Math.min(range.end - partOffset, part.size - 1);

        const stream = await this.cacheStorage.파일범위스트림읽기(
          part.objectKey, readStart, readEnd,
        );
        await pipeline(stream, passThrough, { end: false });
      }
      passThrough.end();
    })().catch(err => passThrough.destroy(err));

    return { file, storageObject, stream: passThrough, isPartial: true, range };
  }
}
