/**
 * 멀티파트 업로드 비즈니스 서비스
 * 대용량 파일 (100MB 이상) 업로드 처리
 */
import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

import {
  UploadPartEntity,
  DEFAULT_PART_SIZE,
  MULTIPART_MIN_FILE_SIZE,
  TransactionOptions,
} from '../../domain/upload-session';

import { InitiateMultipartRequest } from '../../domain/upload-session/dto/initiate-multipart.dto';
import { InitiateMultipartResponse } from '../../domain/upload-session/dto/initiate-multipart.dto';
import { UploadPartRequest } from '../../domain/upload-session/dto/upload-part.dto';
import { UploadPartResponse } from '../../domain/upload-session/dto/upload-part.dto';
import { CompleteMultipartRequest } from '../../domain/upload-session/dto/complete-multipart.dto';
import { CompleteMultipartResponse } from '../../domain/upload-session/dto/complete-multipart.dto';
import { SessionStatusResponse } from '../../domain/upload-session/dto/session-status.dto';
import { AbortSessionResponse } from '../../domain/upload-session/dto/session-status.dto';


import {
  FileStorageObjectEntity,
  ConflictStrategy,
} from '../../domain/file';
import { FolderAvailabilityStatus } from '../../domain/folder';
import { SyncEventFactory } from '../../domain/sync-event';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { JOB_QUEUE_PORT } from '../../infra/queue/job-queue.port';
import {
  NAS_FILE_SYNC_QUEUE_PREFIX,
  type NasFileUploadJobData,
} from '../worker/nas-file-sync.worker';

import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { IJobQueuePort } from '../../infra/queue/job-queue.port';

import { UploadSessionDomainService } from '../../domain/upload-session/service/upload-session-domain.service';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FolderDomainService } from '../../domain/folder/service/folder-domain.service';
import { SyncEventDomainService } from '../../domain/sync-event/service/sync-event-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { FolderNasStorageObjectDomainService } from '../../domain/storage/folder/service/folder-nas-storage-object-domain.service';
import { normalizeFileName } from '../../common/utils';
import { RequestContext } from '../../common/context/request-context';


@Injectable()
export class MultipartUploadService {
  private readonly logger = new Logger(MultipartUploadService.name);

  constructor(
    private readonly uploadSessionDomainService: UploadSessionDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly syncEventDomainService: SyncEventDomainService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly folderNasStorageObjectDomainService: FolderNasStorageObjectDomainService,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    private readonly dataSource: DataSource,
  ) { }

  /**
   * 멀티파트 업로드 초기화
   */
  async initiate(request: InitiateMultipartRequest): Promise<InitiateMultipartResponse> {
    const { fileName: rawFileName, folderId: rawFolderId, totalSize, mimeType, conflictStrategy } = request;

    // 파일명 정규화 (인코딩 문제 해결)
    const fileName = normalizeFileName(rawFileName);

    // 0. 폴더 ID 해석 (root 처리)
    let folderId = rawFolderId;
    if (!folderId || folderId === 'root' || folderId === '/') {
      const rootFolder = await this.folderDomainService.조건조회({ parentId: null });
      if (!rootFolder) {
        throw new NotFoundException({
          code: 'ROOT_FOLDER_NOT_FOUND',
          message: '루트 폴더를 찾을 수 없습니다.',
        });
      }
      folderId = rootFolder.id;
    }

    // 1. 파일 크기 검증 (100MB 이상만 멀티파트)
    if (totalSize < MULTIPART_MIN_FILE_SIZE) {
      throw new BadRequestException({
        code: 'FILE_TOO_SMALL_FOR_MULTIPART',
        message: `멀티파트 업로드는 ${MULTIPART_MIN_FILE_SIZE / 1024 / 1024}MB 이상의 파일에만 사용할 수 있습니다.`,
      });
    }

    // 2. 폴더 존재 확인
    const folder = await this.folderDomainService.조회(folderId);
    if (!folder || !folder.isActive()) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '대상 폴더를 찾을 수 없습니다.',
      });
    }


    // 3. 폴더 NAS 상태 확인
    const folderStorage = await this.folderNasStorageObjectDomainService.조회(folderId);
    if (folderStorage) {
      if (
        folderStorage.availabilityStatus === FolderAvailabilityStatus.SYNCING ||
        folderStorage.availabilityStatus === FolderAvailabilityStatus.MOVING
      ) {
        throw new ConflictException({
          code: 'FOLDER_SYNC_IN_PROGRESS',
          message: '폴더가 동기화 중입니다. 잠시 후 다시 시도해주세요.',
        });
      }
      if (folderStorage.availabilityStatus === FolderAvailabilityStatus.ERROR) {
        throw new InternalServerErrorException({
          code: 'FOLDER_SYNC_FAILED',
          message: '폴더 동기화에 실패했습니다. 관리자에게 문의해주세요.',
        });
      }
    }

    // 4. 세션 ID 생성
    const sessionId = uuidv4();

    // 5. 세션 생성 (Domain Service 사용)
    const session = await this.uploadSessionDomainService.세션생성({
      id: sessionId,
      fileName,
      folderId,
      totalSize,
      mimeType,
      partSize: DEFAULT_PART_SIZE,
      conflictStrategy,
    });

    return {
      sessionId: session.id,
      partSize: session.partSize,
      totalParts: session.totalParts,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * 파트 업로드
   */
  async uploadPart(request: UploadPartRequest): Promise<UploadPartResponse> {
    const { sessionId, partNumber, data } = request;

    // 1. 세션 조회
    const session = await this.uploadSessionDomainService.세션조회(sessionId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: '업로드 세션을 찾을 수 없습니다.',
      });
    }

    // 2. 세션 상태 검증
    if (session.isExpired()) {
      await this.uploadSessionDomainService.엔티티세션만료(session);
      throw new BadRequestException({
        code: 'SESSION_EXPIRED',
        message: '업로드 세션이 만료되었습니다.',
      });
    }

    if (!session.canUploadPart(partNumber)) {
      throw new BadRequestException({
        code: 'INVALID_PART_NUMBER',
        message: `유효하지 않은 파트 번호입니다. (1-${session.totalParts})`,
      });
    }

    // 3. 이미 완료된 파트인지 확인
    if (session.completedParts.includes(partNumber)) {
      const existingPart = await this.uploadSessionDomainService.파트번호조회(sessionId, partNumber);
      if (existingPart && existingPart.isCompleted()) {
        return {
          partNumber,
          etag: existingPart.etag!,
          size: existingPart.size,
          sessionProgress: session.getProgress(),
        };
      }
    }

    // 4. 파트 objectKey 생성
    const objectKey = this.buildPartObjectKey(sessionId, partNumber);

    // 5. 캐시 스토리지에 파트 저장
    await this.cacheStorage.파일쓰기(objectKey, data);

    // 6. ETag 생성 (MD5 해시)
    const etag = createHash('md5').update(data).digest('hex');

    // 7. 파트 엔티티 저장
    let part = await this.uploadSessionDomainService.파트번호조회(sessionId, partNumber);
    if (!part) {
      part = UploadPartEntity.create({
        id: uuidv4(),
        sessionId,
        partNumber,
        size: data.length,
        objectKey,
      });
    }
    part.complete(etag, objectKey);
    await this.uploadSessionDomainService.파트저장(part);

    // 8. 세션 업데이트
    session.markPartCompleted(partNumber, data.length);
    await this.uploadSessionDomainService.세션저장(session);

    return {
      partNumber,
      etag,
      size: data.length,
      sessionProgress: session.getProgress(),
    };
  }

  /**
   * 멀티파트 업로드 완료
   * 
   * 트랜잭션 처리:
   * 1. 검증 단계 (트랜잭션 외부)
   * 2. 파트 병합 (캐시 스토리지 - 트랜잭션 외부)
   * 3. DB 작업 (트랜잭션 내부)
   *    - 파일 엔티티 생성
   *    - 스토리지 객체 생성
   *    - SyncEvent 생성
   *    - 세션 완료 처리
   * 4. 큐 등록 (트랜잭션 외부 - 실패 시 스케줄러가 복구)
   */
  async complete(request: CompleteMultipartRequest): Promise<CompleteMultipartResponse> {
    const { sessionId } = request;

    // 1. 세션 조회 및 검증 (트랜잭션 외부)
    const session = await this.uploadSessionDomainService.세션조회(sessionId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: '업로드 세션을 찾을 수 없습니다.',
      });
    }

    // 2. 세션 상태 검증
    if (session.isCompleted()) {
      throw new ConflictException({
        code: 'SESSION_ALREADY_COMPLETED',
        message: '이미 완료된 업로드 세션입니다.',
      });
    }

    if (session.isAborted()) {
      throw new BadRequestException({
        code: 'SESSION_ABORTED',
        message: '취소된 업로드 세션입니다.',
      });
    }

    if (session.isExpired()) {
      await this.uploadSessionDomainService.엔티티세션만료(session);
      throw new BadRequestException({
        code: 'SESSION_EXPIRED',
        message: '업로드 세션이 만료되었습니다.',
      });
    }

    // 3. 모든 파트 완료 확인
    if (!session.allPartsCompleted()) {
      const pendingParts = session.getPendingParts();
      throw new BadRequestException({
        code: 'INCOMPLETE_PARTS',
        message: `모든 파트가 업로드되지 않았습니다. 미완료 파트: ${pendingParts.join(', ')}`,
      });
    }

    // 4. 완료된 파트 목록 조회
    const parts = await this.uploadSessionDomainService.완료파트목록조회(sessionId);
    if (parts.length !== session.totalParts) {
      throw new BadRequestException({
        code: 'PART_MISMATCH',
        message: '파트 수가 일치하지 않습니다.',
      });
    }

    // 5. 파일 ID 및 기본 정보 생성
    const fileId = uuidv4();
    const uploadCreatedAt = new Date();

    // 6. 파일명 충돌 처리 (트랜잭션 외부에서 먼저 확인)
    const finalFileName = await this.resolveFileName(
      session.folderId,
      session.fileName,
      session.mimeType,
      (session.conflictStrategy as ConflictStrategy) || ConflictStrategy.ERROR,
      uploadCreatedAt,
    );

    // 7. 파트 병합 및 체크섬 계산 (캐시 스토리지 - 트랜잭션 외부)
    const checksum = await this.mergeParts(fileId, parts);

    // 8. 폴더 경로 조회 (트랜잭션 외부)
    const folder = await this.folderDomainService.조회(session.folderId);
    const folderPath = folder ? folder.path : '';
    const filePath = folderPath === '/' ? `/${finalFileName}` : `${folderPath}/${finalFileName}`;
    const nasObjectKey = FileStorageObjectEntity.buildNasObjectKey(uploadCreatedAt, finalFileName);
    const nasPath = folderPath === '/' ? `/${nasObjectKey}` : `${folderPath}/${nasObjectKey}`;

    // 9. SyncEvent ID 미리 생성
    const syncEventId = uuidv4();

    // 트랜잭션 시작
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let fileEntity;
    let syncEvent;

    try {
      const txOptions: TransactionOptions = { queryRunner };

      // 10. 파일 엔티티 생성 (트랜잭션 내부)
      const createdBy = RequestContext.getUserId() || 'unknown';
      fileEntity = await this.fileDomainService.생성({
        id: fileId,
        name: finalFileName,
        folderId: session.folderId,
        sizeBytes: session.totalSize,
        mimeType: session.mimeType,
        createdBy,
        createdAt: uploadCreatedAt,
      }, txOptions);

      // 11. 스토리지 객체 생성 (트랜잭션 내부)
      await this.createStorageObjectsWithTx(fileId, uploadCreatedAt, finalFileName, checksum, txOptions);

      // 12. sync_events 생성 (트랜잭션 내부)
      const userId = RequestContext.getUserId() || 'unknown';
      syncEvent = SyncEventFactory.createFileCreateEvent({
        id: syncEventId,
        fileId,
        sourcePath: fileId,
        targetPath: nasPath,
        fileName: finalFileName,
        folderId: session.folderId,
        processBy: userId,
      });
      await this.syncEventDomainService.저장(syncEvent, txOptions);

      // 13. 세션 완료 처리 (트랜잭션 내부)
      await this.uploadSessionDomainService.엔티티세션완료(session, fileId, txOptions);

      // 트랜잭션 커밋
      await queryRunner.commitTransaction();
      this.logger.debug(`Multipart upload completed: ${fileId}`);

    } catch (error) {
      // 트랜잭션 롤백
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to complete multipart upload: ${sessionId}`, error);

      // 병합된 캐시 파일 정리 (보상 트랜잭션)
      try {
        await this.cacheStorage.파일삭제(fileId);
        this.logger.debug(`Cleaned up merged file after rollback: ${fileId}`);
      } catch (cleanupError) {
        this.logger.error(`Failed to cleanup merged file: ${fileId}`, cleanupError);
      }

      throw error;
    } finally {
      await queryRunner.release();
    }

    // 14. Bull 큐 등록 (트랜잭션 외부 - 실패해도 스케줄러가 복구)
    try {
      await this.jobQueue.addJob<NasFileUploadJobData>(
        NAS_FILE_SYNC_QUEUE_PREFIX,
        {
          fileId,
          action: 'upload',
          syncEventId,
        }
      );

      // 15. 큐 등록 성공 시 QUEUED로 변경
      syncEvent.markQueued();
      await this.syncEventDomainService.저장(syncEvent);
      this.logger.debug(`NAS_FILE_SYNC job added for file: ${fileId}`);
    } catch (queueError) {
      // 큐 등록 실패해도 PENDING 상태로 유지 - 스케줄러가 복구
      this.logger.error(`Failed to add job to queue, scheduler will recover: ${fileId}`, queueError);
    }

    // 16. 파트 파일 정리 (비동기)
    this.cleanupParts(parts).catch((err) => {
      this.logger.error('Failed to cleanup parts:', err);
    });

    return {
      fileId: fileEntity.id,
      name: fileEntity.name,
      folderId: fileEntity.folderId,
      path: filePath,
      size: fileEntity.sizeBytes,
      mimeType: fileEntity.mimeType,
      storageStatus: {
        cache: 'AVAILABLE',
        nas: 'SYNCING',
      },
      createdAt: fileEntity.createdAt.toISOString(),
      syncEventId,
    };
  }

  /**
   * 세션 상태 조회
   */
  async getStatus(sessionId: string): Promise<SessionStatusResponse> {
    const session = await this.uploadSessionDomainService.세션조회(sessionId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: '업로드 세션을 찾을 수 없습니다.',
      });
    }

    // 만료 체크
    if (session.isActive() && session.isExpired()) {
      await this.uploadSessionDomainService.엔티티세션만료(session);
    }

    return {
      sessionId: session.id,
      fileName: session.fileName,
      status: session.status,
      totalSize: session.totalSize,
      uploadedBytes: session.uploadedBytes,
      progress: session.getProgress(),
      totalParts: session.totalParts,
      completedParts: session.completedParts,
      nextPartNumber: session.getNextPartNumber(),
      remainingBytes: session.totalSize - session.uploadedBytes,
      expiresAt: session.expiresAt.toISOString(),
      fileId: session.fileId,
    };
  }

  /**
   * 업로드 취소
   */
  async abort(sessionId: string): Promise<AbortSessionResponse> {
    const session = await this.uploadSessionDomainService.세션조회(sessionId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: '업로드 세션을 찾을 수 없습니다.',
      });
    }

    if (session.isCompleted()) {
      throw new ConflictException({
        code: 'SESSION_ALREADY_COMPLETED',
        message: '이미 완료된 세션은 취소할 수 없습니다. 파일 삭제 API를 사용하세요.',
      });
    }

    if (session.isAborted() || session.isExpired()) {
      return {
        sessionId: session.id,
        status: 'ABORTED',
        message: '이미 취소/만료된 세션입니다.',
      };
    }

    // 파트 목록 조회
    const parts = await this.uploadSessionDomainService.세션파트목록조회(sessionId);

    // 세션 취소 처리
    await this.uploadSessionDomainService.엔티티세션취소(session);

    // 파트 파일 정리 (비동기)
    this.cleanupParts(parts).catch((err) => {
      console.error('Failed to cleanup parts:', err);
    });

    // 파트 레코드 삭제
    await this.uploadSessionDomainService.세션파트일괄삭제(sessionId);

    return {
      sessionId: session.id,
      status: 'ABORTED',
      message: '업로드가 취소되었습니다.',
    };
  }

  /**
   * 파트 objectKey 생성
   */
  private buildPartObjectKey(sessionId: string, partNumber: number): string {
    return `multipart/${sessionId}/part_${partNumber.toString().padStart(5, '0')}`;
  }

  /**
   * 파트 병합
   * @returns SHA-256 체크섬
   */
  private async mergeParts(fileId: string, parts: UploadPartEntity[]): Promise<string> {
    // 파트를 순서대로 읽어서 병합
    const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
    const buffers: Buffer[] = [];

    for (const part of sortedParts) {
      if (!part.objectKey) {
        throw new InternalServerErrorException({
          code: 'PART_OBJECT_KEY_MISSING',
          message: `파트 ${part.partNumber}의 objectKey가 없습니다.`,
        });
      }
      const partData = await this.cacheStorage.파일읽기(part.objectKey);
      buffers.push(partData);
    }

    // 병합된 파일 저장
    const mergedBuffer = Buffer.concat(buffers);

    // SHA-256 체크섬 계산
    const checksum = createHash('sha256').update(mergedBuffer).digest('hex');

    await this.cacheStorage.파일쓰기(fileId, mergedBuffer);

    return checksum;
  }

  /**
   * 파트 파일 정리
   */
  private async cleanupParts(parts: UploadPartEntity[]): Promise<void> {
    for (const part of parts) {
      if (part.objectKey) {
        try {
          await this.cacheStorage.파일삭제(part.objectKey);
        } catch (err) {
          console.error(`Failed to delete part ${part.partNumber}:`, err);
        }
      }
    }
  }

  /**
   * 파일명 충돌 해결
   */
  private async resolveFileName(
    folderId: string,
    originalName: string,
    mimeType: string,
    conflictStrategy: ConflictStrategy,
    createdAt?: Date,
  ): Promise<string> {
    const exists = await this.fileDomainService.중복확인(
      folderId,
      originalName,
      mimeType,
      undefined,
      createdAt,
    );

    if (!exists) {
      return originalName;
    }

    if (conflictStrategy === ConflictStrategy.ERROR) {
      throw new ConflictException({
        code: 'DUPLICATE_FILE_EXISTS',
        message: '동일한 이름의 파일이 이미 존재합니다.',
      });
    }

    // RENAME 전략: 자동 이름 변경
    return this.generateUniqueFileName(folderId, originalName, mimeType, createdAt);
  }

  /**
   * 고유 파일명 생성
   */
  private async generateUniqueFileName(
    folderId: string,
    baseName: string,
    mimeType: string,
    createdAt?: Date,
  ): Promise<string> {
    const lastDot = baseName.lastIndexOf('.');
    const nameWithoutExt = lastDot > 0 ? baseName.substring(0, lastDot) : baseName;
    const ext = lastDot > 0 ? baseName.substring(lastDot) : '';

    let counter = 1;
    let newName = `${nameWithoutExt} (${counter})${ext}`;

    while (
      await this.fileDomainService.중복확인(
        folderId,
        newName,
        mimeType,
        undefined,
        createdAt,
      )
    ) {
      counter++;
      newName = `${nameWithoutExt} (${counter})${ext}`;
    }

    return newName;
  }



  /**
   * 스토리지 객체 생성 (트랜잭션 지원)
   */
  private async createStorageObjectsWithTx(
    fileId: string,
    createdAt: Date,
    fileName: string,
    checksum: string,
    txOptions: TransactionOptions,
  ): Promise<void> {
    await Promise.all([
      this.fileCacheStorageDomainService.생성({
        id: uuidv4(),
        fileId,
        checksum,
      }, txOptions),
      this.fileNasStorageDomainService.생성({
        id: uuidv4(),
        fileId,
        createdAt,
        fileName,
        checksum,
      }, txOptions),
    ]);
  }
}
