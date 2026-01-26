import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  FileEntity,
  FileStorageObjectEntity,
  FileState,
  StorageType,
  AvailabilityStatus,
  UploadFileRequest,
  UploadFileResponse,
  ConflictStrategy,
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/file';
import {
  FOLDER_REPOSITORY,  
} from '../../domain/folder';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';

import type { IFileRepository, IFileStorageObjectRepository } from '../../domain/file';
import type { IFolderRepository } from '../../domain/folder';
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
    @Inject(CACHE_STORAGE_PORT)
    private readonly cacheStorage: ICacheStoragePort,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
  ) {}

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

    // 2. 동일 파일명 체크
    const finalFileName = await this.resolveFileName(
      folderId,
      file.originalname,
      file.mimetype,
      conflictStrategy,
    );

    // 3. UUID 미리 생성
    const fileId = uuidv4();

    // 4. SeaweedFS 저장 (infra 레이어에서 구현)
    await this.cacheStorage.파일쓰기(fileId, file.buffer);

    // 5. DB 저장
    const fileEntity = await this.createFileEntity(fileId, finalFileName, folderId, file);
    await this.createStorageObjects(fileId);

    // 6. Bull 큐 등록 (NAS 동기화)
    await this.jobQueue.addJob('NAS_SYNC_UPLOAD', { fileId });

    // 7. 폴더 경로 조회하여 응답
    const folder = await this.folderRepository.findById(folderId);
    // 루트 폴더인 경우 path가 '/'이므로 슬래시 중복 방지 로직 필요
    const folderPath = folder ? folder.path : '';
    const filePath = folderPath === '/' ? `/${finalFileName}` : `${folderPath}/${finalFileName}`;

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
    };
  }

  /**
   * 업로드 요청 검증
   */
  private async validateUploadRequest(
    file: Express.Multer.File,
    folderId: string,
  ): Promise<void> {
    // 파일 크기 체크 (100MB 미만)
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
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
  }

  /**
   * 파일명 충돌 해결
   */
  private async resolveFileName(
    folderId: string,
    originalName: string,
    mimeType: string,
    conflictStrategy: ConflictStrategy,
  ): Promise<string> {
    const exists = await this.fileRepository.existsByNameInFolder(
      folderId,
      originalName,
      mimeType,
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
    return this.generateUniqueFileName(folderId, originalName, mimeType);
  }

  /**
   * 고유 파일명 생성 (충돌 시)
   */
  private async generateUniqueFileName(
    folderId: string,
    baseName: string,
    mimeType: string,
  ): Promise<string> {
    const lastDot = baseName.lastIndexOf('.');
    const nameWithoutExt = lastDot > 0 ? baseName.substring(0, lastDot) : baseName;
    const ext = lastDot > 0 ? baseName.substring(lastDot) : '';

    let counter = 1;
    let newName = `${nameWithoutExt} (${counter})${ext}`;

    while (await this.fileRepository.existsByNameInFolder(folderId, newName, mimeType)) {
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
  ): Promise<FileEntity> {
    const fileEntity = new FileEntity({
      id: fileId,
      name: fileName,
      folderId,
      sizeBytes: file.size,
      mimeType: file.mimetype,
      state: FileState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.fileRepository.save(fileEntity);
  }

  /**
   * 스토리지 객체 생성
   */
  private async createStorageObjects(fileId: string): Promise<void> {
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
      objectKey: '', // NAS 경로는 동기화 완료 후 설정
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
}
