import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  FolderEntity,
  FolderState,
  FolderInfoResponse,
  FolderContentsResponse,
  GetFolderContentsQuery,
  BreadcrumbItem,
  FolderListItem,
  FileListItemInFolder,
  FOLDER_REPOSITORY,
  FOLDER_STORAGE_OBJECT_REPOSITORY
} from '../../domain/folder';
import type { IFolderRepository, IFolderStorageObjectRepository } from '../../domain/folder';
import {
  FileState,
  StorageType,
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY
} from '../../domain/file';
import type { IFileRepository, IFileStorageObjectRepository } from '../../domain/file';

/**
 * 폴더 조회 비즈니스 서비스
 * 폴더 정보 조회, 폴더 내용 조회, 브레드크럼 조회
 */
@Injectable()
export class FolderQueryService {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(FOLDER_STORAGE_OBJECT_REPOSITORY)
    private readonly folderStorageObjectRepository: IFolderStorageObjectRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
  ) {}

  /**
   * 루트 폴더 정보 조회
   */
  async getRootFolderInfo(): Promise<FolderInfoResponse> {
    const folder = await this.folderRepository.findOne({ parentId: null });
    if (!folder) {
      throw new NotFoundException({
        code: 'ROOT_FOLDER_NOT_FOUND',
        message: '루트 폴더를 찾을 수 없습니다.',
      });
    }

    const storageObject = await this.folderStorageObjectRepository.findByFolderId(folder.id);
    const statistics = await this.folderRepository.getStatistics(folder.id);

    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      state: folder.state,
      storageStatus: {
        nas: storageObject?.availabilityStatus ?? null,
      },
      fileCount: statistics.fileCount,
      folderCount: statistics.folderCount,
      totalSize: statistics.totalSize,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }

  /**
   * 폴더 정보 조회
   */
  async getFolderInfo(folderId: string): Promise<FolderInfoResponse> {
    const folder = await this.folderRepository.findById(folderId);
    if (!folder) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '폴더를 찾을 수 없습니다.',
      });
    }

    const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);
    const statistics = await this.folderRepository.getStatistics(folderId);

    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      state: folder.state,
      storageStatus: {
        nas: storageObject?.availabilityStatus ?? null,
      },
      fileCount: statistics.fileCount,
      folderCount: statistics.folderCount,
      totalSize: statistics.totalSize,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }

  /**
   * 폴더 내용 조회 (하위 폴더/파일 목록)
   */
  async getFolderContents(
    folderId: string,
    query: GetFolderContentsQuery,
  ): Promise<FolderContentsResponse> {
    const {
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 50,
    } = query;

    // 1. 폴더 존재 확인
    const folder = await this.folderRepository.findById(folderId);
    if (!folder || folder.isTrashed()) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '폴더를 찾을 수 없습니다.',
      });
    }

    // 2. 브레드크럼 생성
    const breadcrumbs = await this.getBreadcrumbs(folderId);

    // 3. 하위 폴더 조회
    const subFolders = await this.folderRepository.findByParentId(folderId, FolderState.ACTIVE);
    const folderListItems = await this.mapToFolderListItems(subFolders);

    // 4. 파일 조회
    const files = await this.fileRepository.findByFolderId(folderId, FileState.ACTIVE);
    const fileListItems = await this.mapToFileListItems(files);

    // 5. 정렬
    const sortedFolders = this.sortItems(folderListItems, sortBy, sortOrder);
    const sortedFiles = this.sortItems(fileListItems, sortBy, sortOrder);

    // 6. 페이지네이션 (폴더 먼저, 그 다음 파일)
    const offset = (page - 1) * limit;
    const paginatedFolders = sortedFolders.slice(offset, offset + limit);
    const remainingLimit = limit - paginatedFolders.length;
    const fileOffset = Math.max(0, offset - sortedFolders.length);
    const paginatedFiles = remainingLimit > 0
      ? sortedFiles.slice(fileOffset, fileOffset + remainingLimit)
      : [];

    return {
      folderId: folder.id,
      path: folder.path,
      breadcrumbs,
      folders: paginatedFolders,
      files: paginatedFiles,
      pagination: {
        page,
        limit,
        totalFolders: sortedFolders.length,
        totalFiles: sortedFiles.length,
      },
    };
  }

  /**
   * 브레드크럼 조회 (상위 폴더 체인)
   */
  async getBreadcrumbs(folderId: string): Promise<BreadcrumbItem[]> {
    const ancestors = await this.folderRepository.findAncestors(folderId);
    return ancestors.map(folder => ({
      id: folder.id,
      name: folder.name,
    }));
  }

  /**
   * 폴더 목록을 FolderListItem으로 변환
   */
  private async mapToFolderListItems(folders: FolderEntity[]): Promise<FolderListItem[]> {
    const items: FolderListItem[] = [];

    for (const folder of folders) {
      const storageObject = await this.folderStorageObjectRepository.findByFolderId(folder.id);
      const statistics = await this.folderRepository.getStatistics(folder.id);

      items.push({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        storageStatus: {
          nas: storageObject?.availabilityStatus ?? null,
        },
        fileCount: statistics.fileCount,
        folderCount: statistics.folderCount,
        updatedAt: folder.updatedAt.toISOString(),
      });
    }

    return items;
  }

  /**
   * 파일 목록을 FileListItemInFolder로 변환
   */
  private async mapToFileListItems(files: any[]): Promise<FileListItemInFolder[]> {
    const items: FileListItemInFolder[] = [];

    for (const file of files) {
      const storageObjects = await this.fileStorageObjectRepository.findByFileId(file.id);
      const cacheStatus = storageObjects.find(s => s.storageType === StorageType.CACHE);
      const nasStatus = storageObjects.find(s => s.storageType === StorageType.NAS);

      items.push({
        id: file.id,
        name: file.name,
        size: file.sizeBytes,
        mimeType: file.mimeType,
        storageStatus: {
          cache: cacheStatus?.availabilityStatus ?? null,
          nas: nasStatus?.availabilityStatus ?? null,
        },
        updatedAt: file.updatedAt.toISOString(),
      });
    }

    return items;
  }

  /**
   * 아이템 정렬
   */
  private sortItems<T extends { name: string; updatedAt: string }>(
    items: T[],
    sortBy: string,
    sortOrder: string,
  ): T[] {
    return [...items].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
}
