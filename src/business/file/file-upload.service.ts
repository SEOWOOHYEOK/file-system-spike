import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  FileEntity,
  FileStorageObjectEntity,
  UploadFileRequest,
  UploadFilesRequest,
  UploadFileResponse,
  ConflictStrategy,
  FILE_REPOSITORY,
} from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import {
  FOLDER_REPOSITORY,
  FolderAvailabilityStatus,
} from '../../domain/folder';
import {
  SyncEventFactory,
  SYNC_EVENT_REPOSITORY,
} from '../../domain/sync-event';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import {
  FILE_STORAGE_OBJECT_REPOSITORY,

} from '../../domain/storage';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import {
  NAS_FILE_SYNC_QUEUE_PREFIX,
  type NasFileSyncJobData,
} from '../worker/nas-file-sync.worker';
import { AuditLogHelper } from '../audit/audit-log-helper.service';
import { UserType } from '../../domain/audit/enums/common.enum';
import { RequestContext } from '../../common/context/request-context';
import { normalizeFileName } from '../../common/utils';

import {
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';

import {
  type IFolderStorageObjectRepository,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';

import type { IFileRepository } from '../../domain/file';
import type { IFolderRepository } from '../../domain/folder';
import type { IFileStorageObjectRepository, } from '../../domain/storage';
import type { ISyncEventRepository } from '../../domain/sync-event';
import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';

/**
 * 파일 업로드 비즈니스 서비스
 * 일반 파일 업로드 (100MB 미만) 처리
 */
@Injectable()
export class FileUploadService {
  constructor(
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
    private readonly auditLogHelper: AuditLogHelper,
  ) { }

  /**
   * 파일 업로드
   * 
   * 처리 플로우:
   * 1. 요청 검증 (파일 크기, 타입, 폴더 존재)
   * 2. 동일 파일명 체크 + 충돌 전략 처리
   * 3. UUID 미리 생성
   * 4. SeaweedFS 저장 먼저
   * 5. DB 트랜잭션 (files, file_storage_objects)
   * 6. Bull 큐 등록 (NAS 동기화)
   * 7. 응답 반환
   */
  async upload(request: UploadFileRequest): Promise<UploadFileResponse> {
    const { file, folderId: rawFolderId, conflictStrategy = ConflictStrategy.ERROR } = request;

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

    // 1. 요청 검증
    await this.validateUploadRequest(file, folderId);

    // 2. 업로드 타임스탬프 생성 (중복 체크에 사용)
    const uploadCreatedAt = new Date();

    // 2.5. 파일명 정규화 (Multer Latin-1 인코딩 문제 해결)
    const normalizedOriginalName = normalizeFileName(file.originalname);

    // 3. 동일 파일명 체크 (createdAt 포함)
    const finalFileName = await this.resolveFileName(
      folderId,
      normalizedOriginalName,
      file.mimetype,
      conflictStrategy,
      uploadCreatedAt,
    );

    // 4. UUID 미리 생성
    const fileId = uuidv4();

    // 5. SeaweedFS 저장 (infra 레이어에서 구현)
    await this.cacheStorage.파일쓰기(fileId, file.buffer);

    // 6. DB 저장
    const fileEntity = await this.createFileEntity(fileId, finalFileName, folderId, file, uploadCreatedAt);
    await this.createStorageObjects(fileId, uploadCreatedAt, finalFileName);

    // 7. 폴더 경로 조회
    const folder = await this.folderRepository.findById(folderId);
    const folderPath = folder ? folder.path : '';
    const filePath = folderPath === '/' ? `/${finalFileName}` : `${folderPath}/${finalFileName}`;
    const nasObjectKey = FileStorageObjectEntity.buildNasObjectKey(uploadCreatedAt, finalFileName);
    const nasPath = folderPath === '/' ? `/${nasObjectKey}` : `${folderPath}/${nasObjectKey}`;

    // 8. sync_events 생성 (문서 요구사항)
    const syncEventId = uuidv4();
    
    const syncEvent = SyncEventFactory.createFileCreateEvent({
      id: syncEventId,
      fileId,
      sourcePath: fileId, // 캐시 objectKey
      targetPath: nasPath, // NAS 경로
      fileName: finalFileName,
      folderId,
    });
    await this.syncEventRepository.save(syncEvent);

    // 9. Bull 큐 등록 (NAS 동기화) - 파일 기반 통합 큐 사용
    await this.jobQueue.addJob<NasFileSyncJobData>(
      NAS_FILE_SYNC_QUEUE_PREFIX,
      {
        fileId,
        action: 'upload',
        syncEventId,
      },
    );

    // 10. 감사 로그 및 파일 이력 기록
    const ctx = RequestContext.get();
    if (ctx?.userId) {
      await this.auditLogHelper.logFileUpload({
        userId: ctx.userId,
        userType: (ctx.userType as UserType) || UserType.INTERNAL,
        userName: ctx.userName,
        userEmail: ctx.userEmail,
        fileId,
        fileName: finalFileName,
        filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
      });
    }

    return {
      id: fileEntity.id,
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
   * 다중 파일 업로드
   * 
   * 처리 플로우:
   * 1. 각 파일에 대해 순차적으로 upload 메서드 호출
   * 2. 모든 결과를 배열로 반환
   */
  async uploadMany(request: UploadFilesRequest): Promise<UploadFileResponse[]> {
    const { files, folderId, conflictStrategy } = request;
    const results: UploadFileResponse[] = [];

    for (const file of files) {
      const result = await this.upload({
        file,
        folderId,
        conflictStrategy,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * 업로드 요청 검증
   */
  private async validateUploadRequest(
    file: Express.Multer.File,
    folderId: string,
  ): Promise<void> {
    // 파일 크기 체크 (100MB 미만)
    const MAX_SIZE = 10 * 100 * 1024 * 1024; // 100MB
    if (file.size >= MAX_SIZE) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: '파일 크기가 100MB를 초과합니다.',
      });
    }

    // 폴더 존재 확인
    const folder = await this.folderRepository.findById(folderId);
    if (!folder || !folder.isActive()) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '대상 폴더를 찾을 수 없습니다.',
      });
    }

    // 폴더 NAS 상태 확인
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
   * 고유 파일명 생성 (충돌 시)
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
   * 파일 엔티티 생성 및 저장
   */
  private async createFileEntity(
    fileId: string,
    fileName: string,
    folderId: string,
    file: Express.Multer.File,
    createdAt: Date,
  ): Promise<FileEntity> {
    const fileEntity = new FileEntity({
      id: fileId,
      name: fileName,
      folderId,
      sizeBytes: file.size,
      mimeType: file.mimetype,
      state: FileState.ACTIVE,
      createdAt,
      updatedAt: createdAt,
    });

    return this.fileRepository.save(fileEntity);
  }

  /**
   * 스토리지 객체 생성
   */
  private async createStorageObjects(
    fileId: string,
    createdAt: Date,
    fileName: string,
  ): Promise<void> {
    const cacheObject = FileStorageObjectEntity.createForCache({
      id: uuidv4(),
      fileId,
    });

    const nasObject = FileStorageObjectEntity.createForNas({
      id: uuidv4(),
      fileId,
      createdAt,
      fileName,
    });

    await Promise.all([
      this.fileStorageObjectRepository.save(cacheObject),
      this.fileStorageObjectRepository.save(nasObject),
    ]);
  }
}
