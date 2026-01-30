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
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

import {
  UploadSessionEntity,
  UploadPartEntity,
  DEFAULT_PART_SIZE,
  MULTIPART_MIN_FILE_SIZE,
  UPLOAD_SESSION_REPOSITORY,
  UPLOAD_PART_REPOSITORY,

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
  FileEntity,
  FileStorageObjectEntity,
  StorageType,
  AvailabilityStatus,
  ConflictStrategy,
  FILE_REPOSITORY,
} from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import { FOLDER_REPOSITORY, FolderAvailabilityStatus } from '../../domain/folder';
import { SyncEventFactory, SYNC_EVENT_REPOSITORY } from '../../domain/sync-event';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import {
  FILE_STORAGE_OBJECT_REPOSITORY,

} from '../../domain/storage';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';

import type { IUploadSessionRepository, IUploadPartRepository } from '../../domain/upload-session';
import type { IFileRepository } from '../../domain/file';
import type { IFolderRepository } from '../../domain/folder';
import type { IFileStorageObjectRepository } from '../../domain/storage';
import type { ISyncEventRepository } from '../../domain/sync-event';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import {
  type IFolderStorageObjectRepository,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';


import {
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';


@Injectable()
export class MultipartUploadService {
  constructor(
    @Inject(UPLOAD_SESSION_REPOSITORY)
    private readonly sessionRepository: IUploadSessionRepository,
    @Inject(UPLOAD_PART_REPOSITORY)
    private readonly partRepository: IUploadPartRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(FOLDER_STORAGE_OBJECT_REPOSITORY)
    private readonly folderStorageObjectRepository: IFolderStorageObjectRepository,
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
  ) { }

  /**
   * 멀티파트 업로드 초기화
   */
  async initiate(request: InitiateMultipartRequest): Promise<InitiateMultipartResponse> {
    const { fileName, folderId: rawFolderId, totalSize, mimeType, conflictStrategy } = request;

    // 0. 폴더 ID 해석 (root 처리)
    let folderId = rawFolderId;
    if (!folderId || folderId === 'root' || folderId === '/') {
      const rootFolder = await this.folderRepository.findOne({ parentId: null });
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
    const folder = await this.folderRepository.findById(folderId);
    if (!folder || !folder.isActive()) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '대상 폴더를 찾을 수 없습니다.',
      });
    }

    // 3. 폴더 NAS 상태 확인
    const folderStorage = await this.folderStorageObjectRepository.findByFolderId(folderId);
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

    // 5. 세션 생성
    const session = UploadSessionEntity.create({
      id: sessionId,
      fileName,
      folderId,
      totalSize,
      mimeType,
      partSize: DEFAULT_PART_SIZE,
      conflictStrategy,
    });

    // 6. 저장
    await this.sessionRepository.save(session);

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
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: '업로드 세션을 찾을 수 없습니다.',
      });
    }

    // 2. 세션 상태 검증
    if (session.isExpired()) {
      session.expire();
      await this.sessionRepository.save(session);
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
      const existingPart = await this.partRepository.findBySessionIdAndPartNumber(sessionId, partNumber);
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
    let part = await this.partRepository.findBySessionIdAndPartNumber(sessionId, partNumber);
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
    await this.partRepository.save(part);

    // 8. 세션 업데이트
    session.markPartCompleted(partNumber, data.length);
    await this.sessionRepository.save(session);

    return {
      partNumber,
      etag,
      size: data.length,
      sessionProgress: session.getProgress(),
    };
  }

  /**
   * 멀티파트 업로드 완료
   */
  async complete(request: CompleteMultipartRequest): Promise<CompleteMultipartResponse> {
    const { sessionId } = request;

    // 1. 세션 조회
    const session = await this.sessionRepository.findById(sessionId);
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
      session.expire();
      await this.sessionRepository.save(session);
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
    const parts = await this.partRepository.findCompletedBySessionId(sessionId);
    if (parts.length !== session.totalParts) {
      throw new BadRequestException({
        code: 'PART_MISMATCH',
        message: '파트 수가 일치하지 않습니다.',
      });
    }

    // 5. 파일 ID 생성
    const fileId = uuidv4();
    const uploadCreatedAt = new Date();

    // 6. 파일명 충돌 처리
    const finalFileName = await this.resolveFileName(
      session.folderId,
      session.fileName,
      session.mimeType,
      (session.conflictStrategy as ConflictStrategy) || ConflictStrategy.ERROR,
      uploadCreatedAt,
    );

    // 7. 파트 병합 (캐시 스토리지)
    await this.mergeParts(fileId, parts);

    // 8. 파일 엔티티 생성
    const fileEntity = new FileEntity({
      id: fileId,
      name: finalFileName,
      folderId: session.folderId,
      sizeBytes: session.totalSize,
      mimeType: session.mimeType,
      state: FileState.ACTIVE,
      createdAt: uploadCreatedAt,
      updatedAt: uploadCreatedAt,
    });
    await this.fileRepository.save(fileEntity);

    // 9. 스토리지 객체 생성
    const nasObjectKey = this.buildNasObjectKey(uploadCreatedAt, finalFileName);
    await this.createStorageObjects(fileId, nasObjectKey);

    // 10. 폴더 경로 조회
    const folder = await this.folderRepository.findById(session.folderId);
    const folderPath = folder ? folder.path : '';
    const filePath = folderPath === '/' ? `/${finalFileName}` : `${folderPath}/${finalFileName}`;
    const nasPath = folderPath === '/' ? `/${nasObjectKey}` : `${folderPath}/${nasObjectKey}`;

    // 11. sync_events 생성
    const syncEventId = uuidv4();
    const syncEvent = SyncEventFactory.createFileCreateEvent({
      id: syncEventId,
      fileId,
      sourcePath: fileId,
      targetPath: nasPath,
      fileName: finalFileName,
      folderId: session.folderId,
    });
    await this.syncEventRepository.save(syncEvent);

    // 12. Bull 큐 등록
    await this.jobQueue.addJob('NAS_SYNC_UPLOAD', { fileId, syncEventId });

    // 13. 세션 완료 처리
    session.complete(fileId);
    await this.sessionRepository.save(session);

    // 14. 파트 파일 정리 (비동기)
    this.cleanupParts(parts).catch((err) => {
      console.error('Failed to cleanup parts:', err);
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
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: '업로드 세션을 찾을 수 없습니다.',
      });
    }

    // 만료 체크
    if (session.isActive() && session.isExpired()) {
      session.expire();
      await this.sessionRepository.save(session);
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
    const session = await this.sessionRepository.findById(sessionId);
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
    const parts = await this.partRepository.findBySessionId(sessionId);

    // 세션 취소 처리
    session.abort();
    await this.sessionRepository.save(session);

    // 파트 파일 정리 (비동기)
    this.cleanupParts(parts).catch((err) => {
      console.error('Failed to cleanup parts:', err);
    });

    // 파트 레코드 삭제
    await this.partRepository.deleteBySessionId(sessionId);

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
   */
  private async mergeParts(fileId: string, parts: UploadPartEntity[]): Promise<void> {
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
    await this.cacheStorage.파일쓰기(fileId, mergedBuffer);
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
    const exists = await this.fileRepository.existsByNameInFolder(
      folderId,
      originalName,
      mimeType,
      undefined,
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
      await this.fileRepository.existsByNameInFolder(
        folderId,
        newName,
        mimeType,
        undefined,
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
   * 스토리지 객체 생성
   */
  private async createStorageObjects(fileId: string, nasObjectKey: string): Promise<void> {
    // 캐시 스토리지 객체 (AVAILABLE)
    const cacheObject = new FileStorageObjectEntity({
      id: uuidv4(),
      fileId,
      storageType: StorageType.CACHE,
      objectKey: fileId,
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      lastAccessed: new Date(),
      accessCount: 1,
      leaseCount: 0,
      createdAt: new Date(),
    });

    // NAS 스토리지 객체 (SYNCING)
    const nasObject = new FileStorageObjectEntity({
      id: uuidv4(),
      fileId,
      storageType: StorageType.NAS,
      objectKey: nasObjectKey,
      availabilityStatus: AvailabilityStatus.SYNCING,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });

    await Promise.all([
      this.fileStorageObjectRepository.save(cacheObject),
      this.fileStorageObjectRepository.save(nasObject),
    ]);
  }

  /**
   * NAS objectKey 생성
   */
  private buildNasObjectKey(createdAt: Date, fileName: string): string {
    const y = createdAt.getUTCFullYear().toString().padStart(4, '0');
    const m = (createdAt.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = createdAt.getUTCDate().toString().padStart(2, '0');
    const hh = createdAt.getUTCHours().toString().padStart(2, '0');
    const mm = createdAt.getUTCMinutes().toString().padStart(2, '0');
    const ss = createdAt.getUTCSeconds().toString().padStart(2, '0');
    const timestamp = `${y}${m}${d}${hh}${mm}${ss}`;
    return `${timestamp}__${fileName}`;
  }
}
