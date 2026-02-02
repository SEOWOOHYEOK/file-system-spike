import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  FileEntity,
  FileStorageObjectEntity,
  UploadFileRequest,
  UploadFilesRequest,
  UploadFileResponse,
  ConflictStrategy,
} from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import { FolderAvailabilityStatus } from '../../domain/folder';
import { SyncEventFactory } from '../../domain/sync-event';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import {
  NAS_FILE_SYNC_QUEUE_PREFIX,
  type NasFileSyncJobData,
} from '../worker/nas-file-sync.worker';
import { AuditLogHelper } from '../audit/audit-log-helper.service';
import { UserType } from '../../domain/audit/enums/common.enum';
import { RequestContext } from '../../common/context/request-context';
import { normalizeFileName } from '../../common/utils';

// Domain Services
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FolderDomainService } from '../../domain/folder/service/folder-domain.service';
import { SyncEventDomainService } from '../../domain/sync-event/service/sync-event-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { FolderNasStorageObjectDomainService } from '../../domain/storage/folder/service/folder-nas-storage-object-domain.service';

import type { ICacheStoragePort } from '../../domain/storage/ports/cache-storage.port';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';

/**
 * 파일 업로드 비즈니스 서비스
 * 일반 파일 업로드 (100MB 미만) 처리
 */
@Injectable()
export class FileUploadService {
  constructor(
    // Domain Services
    private readonly fileDomainService: FileDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly syncEventDomainService: SyncEventDomainService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
    private readonly folderNasStorageObjectDomainService: FolderNasStorageObjectDomainService,
    // External Ports (Infra)
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
      const rootFolder = await this.folderDomainService.루트폴더조회();
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

    // 6. DB 저장 (Domain Service 사용)
    const fileEntity = await this.createFileEntity(fileId, finalFileName, folderId, file, uploadCreatedAt);
    await this.createStorageObjects(fileId, uploadCreatedAt, finalFileName);

    // 7. 폴더 경로 조회
    const folder = await this.folderDomainService.조회(folderId);
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
    await this.syncEventDomainService.저장(syncEvent);

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

    // 폴더 존재 확인 (Domain Service 사용)
    const folder = await this.folderDomainService.조회(folderId);
    if (!folder || !folder.isActive()) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '대상 폴더를 찾을 수 없습니다.',
      });
    }

    // 폴더 NAS 상태 확인 (Domain Service 사용)
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
    // Domain Service 사용
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

    // Domain Service 사용
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
   * 파일 엔티티 생성 및 저장
   */
  private async createFileEntity(
    fileId: string,
    fileName: string,
    folderId: string,
    file: Express.Multer.File,
    createdAt: Date,
  ): Promise<FileEntity> {
    // Domain Service 사용
    return this.fileDomainService.생성({
      id: fileId,
      name: fileName,
      folderId,
      sizeBytes: file.size,
      mimeType: file.mimetype,
      createdAt,
    });
  }

  /**
   * 스토리지 객체 생성
   */
  private async createStorageObjects(
    fileId: string,
    createdAt: Date,
    fileName: string,
  ): Promise<void> {
    // Domain Service 사용
    await Promise.all([
      this.fileCacheStorageDomainService.생성({
        id: uuidv4(),
        fileId,
      }),
      this.fileNasStorageDomainService.생성({
        id: uuidv4(),
        fileId,
        createdAt,
        fileName,
      }),
    ]);
  }
}
