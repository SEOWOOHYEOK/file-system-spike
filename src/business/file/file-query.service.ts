import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { buildPath } from '../../common/utils';
import type { FileInfoResponse } from '../../domain/file';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FolderDomainService } from '../../domain/folder/service/folder-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';

/**
 * 파일 조회 비즈니스 서비스
 * 
 * 파일 정보 조회, 메타데이터 조회 등 읽기 전용 작업을 처리합니다.
 * 다운로드, 업로드, 관리 서비스에서 공통으로 사용할 수 있습니다.
 */
@Injectable()
export class FileQueryService {
  private readonly logger = new Logger(FileQueryService.name);

  constructor(
    private readonly fileDomainService: FileDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly fileCacheStorageDomainService: FileCacheStorageDomainService,
    private readonly fileNasStorageDomainService: FileNasStorageDomainService,
  ) {}

  /**
   * 파일 정보 조회
   * 
   * 파일 메타데이터, 스토리지 상태, 체크섬 등을 반환합니다.
   * 병렬 다운로드 전 파일 크기와 체크섬 확인에 사용됩니다.
   * 
   * @param fileId - 파일 ID
   * @returns 파일 정보 (크기, 체크섬, 스토리지 상태 등)
   */
  async getFileInfo(fileId: string): Promise<FileInfoResponse> {
    const file = await this.fileDomainService.조회(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    const cacheStatus = await this.fileCacheStorageDomainService.조회(fileId);
    const nasStatus = await this.fileNasStorageDomainService.조회(fileId);
    const folder = await this.folderDomainService.조회(file.folderId);

    // folder.path '/'인 경우(루트) 처리 포함
    const filePath = buildPath(folder?.path || '/', file.name);

    // 체크섬은 NAS 또는 캐시 스토리지 객체에서 가져옴
    const checksum = nasStatus?.checksum ?? cacheStatus?.checksum ?? null;

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
      checksum,
    };
  }

  /**
   * 파일 존재 여부 확인
   * 
   * @param fileId - 파일 ID
   * @returns 존재 여부
   */
  async exists(fileId: string): Promise<boolean> {
    const file = await this.fileDomainService.조회(fileId);
    return file !== null;
  }

  /**
   * 파일 크기 조회 (간편 메서드)
   * 
   * @param fileId - 파일 ID
   * @returns 파일 크기 (bytes)
   */
  async getFileSize(fileId: string): Promise<number> {
    const file = await this.fileDomainService.조회(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }
    return file.sizeBytes;
  }

  /**
   * 파일 체크섬 조회 (간편 메서드)
   * 
   * @param fileId - 파일 ID
   * @returns 체크섬 (SHA-256) 또는 null
   */
  async getChecksum(fileId: string): Promise<string | null> {
    const nasStatus = await this.fileNasStorageDomainService.조회(fileId);
    const cacheStatus = await this.fileCacheStorageDomainService.조회(fileId);
    return nasStatus?.checksum ?? cacheStatus?.checksum ?? null;
  }
}
