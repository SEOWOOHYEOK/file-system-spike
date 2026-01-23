import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  FileState,
  StorageType,
  AvailabilityStatus,
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/file';
import type {
  FileEntity,
  FileStorageObjectEntity,
  FileInfoResponse,
  IFileRepository,
  IFileStorageObjectRepository,
} from '../../domain/file';
import { FOLDER_REPOSITORY } from '../../domain/folder';
import type { IFolderRepository } from '../../domain/folder';

/**
 * 파일 다운로드 비즈니스 서비스
 * 파일 조회 및 다운로드 처리 (캐시 히트/미스 포함)
 */
@Injectable()
export class FileDownloadService {
  constructor(
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
  ) {}

  /**
   * 파일 정보 조회
   */
  async getFileInfo(fileId: string): Promise<FileInfoResponse> {
    const file = await this.fileRepository.findById(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    const storageObjects = await this.fileStorageObjectRepository.findByFileId(fileId);
    const cacheStatus = storageObjects.find(s => s.storageType === StorageType.CACHE);
    const nasStatus = storageObjects.find(s => s.storageType === StorageType.NAS);

    const folder = await this.folderRepository.findById(file.folderId);
    const filePath = folder ? `${folder.path}/${file.name}` : `/${file.name}`;

    return {
      id: file.id,
      name: file.name,
      folderId: file.folderId,
      path: filePath,
      size: file.sizeBytes,
      mimeType: file.mimeType,
      state: file.state,
      storageStatus: {
        cache: cacheStatus?.availabilityStatus ?? null,
        nas: nasStatus?.availabilityStatus ?? null,
      },
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    };
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
    const file = await this.fileRepository.findById(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    if (file.isTrashed()) {
      throw new BadRequestException({
        code: 'FILE_TRASHED',
        message: '휴지통에 있는 파일입니다.',
      });
    }

    if (file.isDeleted()) {
      throw new NotFoundException({
        code: 'FILE_DELETED',
        message: '삭제된 파일입니다.',
      });
    }

    // 2. 캐시 상태 확인
    const cacheObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.CACHE,
    );

    // 3-A. 캐시 히트
    if (cacheObject && cacheObject.isAvailable()) {
      return this.downloadFromCache(file, cacheObject);
    }

    // 3-B. 캐시 미스 - NAS에서 조회
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.NAS,
    );

    if (nasObject && nasObject.isAvailable()) {
      return this.downloadFromNas(file, nasObject);
    }

    // 3-C. 둘 다 없음
    throw new NotFoundException({
      code: 'FILE_STORAGE_NOT_FOUND',
      message: '파일 스토리지를 찾을 수 없습니다. 관리자에게 문의하세요.',
    });
  }

  /**
   * 캐시에서 다운로드
   */
  private async downloadFromCache(
    file: FileEntity,
    cacheObject: FileStorageObjectEntity,
  ): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream | null;
  }> {
    // lease 획득
    cacheObject.acquireLease();
    await this.fileStorageObjectRepository.save(cacheObject);

    try {
      // TODO: SeaweedFS에서 스트림 획득 (infra 레이어에서 구현)
      // const stream = await this.storageService.getStream(cacheObject.objectKey);

      return {
        file,
        storageObject: cacheObject,
        stream: null, // 실제 구현 시 스트림 반환
      };
    } finally {
      // lease 해제는 스트림 완료 후 처리해야 함 (실제 구현 시)
    }
  }

  /**
   * NAS에서 다운로드
   */
  private async downloadFromNas(
    file: FileEntity,
    nasObject: FileStorageObjectEntity,
  ): Promise<{
    file: FileEntity;
    storageObject: FileStorageObjectEntity;
    stream: NodeJS.ReadableStream | null;
  }> {
    // TODO: NAS에서 스트림 획득 (infra 레이어에서 구현)
    // const stream = await this.nasService.getStream(nasObject.objectKey);

    // TODO: 백그라운드로 캐시 복원
    // await this.nasQueue.add('CACHE_RESTORE', { fileId: file.id });

    return {
      file,
      storageObject: nasObject,
      stream: null, // 실제 구현 시 스트림 반환
    };
  }

  /**
   * 다운로드 완료 후 lease 해제
   */
  async releaseLease(fileId: string): Promise<void> {
    const cacheObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.CACHE,
    );

    if (cacheObject) {
      cacheObject.releaseLease();
      await this.fileStorageObjectRepository.save(cacheObject);
    }
  }
}
