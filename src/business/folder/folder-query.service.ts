import { Injectable } from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import {
  FolderEntity,
  FolderState,
  FolderInfoResponse,
  FolderContentsResponse,
  GetFolderContentsQuery,
  BreadcrumbItem,
  FolderListItem,
  FileListItemInFolder,
  SortBy,
  SortOrder,
  FolderDomainService,
} from '../../domain/folder';
import { createPaginationInfo } from '../../common/types/pagination';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FolderNasStorageObjectDomainService } from '../../domain/storage/folder/service/folder-nas-storage-object-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { FileState } from '../../domain/file/type/file.type';
import { FileActionRequestDomainService } from '../../domain/file-action-request/services/file-action-request-domain.service';
import type { FileActionRequest } from '../../domain/file-action-request/entities/file-action-request.entity';

/**
 * 폴더 조회 비즈니스 서비스
 * 폴더 정보 조회, 폴더 내용 조회, 브레드크럼 조회
 * 
 * DDD 규칙: Business Layer는 Repository를 직접 주입받지 않고
 * Domain Service를 통해 도메인 로직을 실행합니다.
 */
@Injectable()
export class FolderQueryService {
  constructor(
    private readonly folderDomainService: FolderDomainService,
    private readonly folderStorageService: FolderNasStorageObjectDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly fileCacheStorageService: FileCacheStorageDomainService,
    private readonly fileNasStorageService: FileNasStorageDomainService,
    private readonly fileActionRequestDomainService: FileActionRequestDomainService,
  ) {}

  /**
   * 루트 폴더 정보 조회
   */
  async getRootFolderInfo(): Promise<FolderInfoResponse> {
    const folder = await this.folderDomainService.루트폴더조회();
    if (!folder) {
      throw BusinessException.of(ErrorCodes.FOLDER_ROOT_NOT_FOUND);
    }

    const storageObject = await this.folderStorageService.조회(folder.id);
    const statistics = await this.folderDomainService.통계조회(folder.id);

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
    const folder = await this.folderDomainService.조회(folderId);
    if (!folder) {
      throw BusinessException.of(ErrorCodes.FOLDER_NOT_FOUND, { folderId });
    }

    const storageObject = await this.folderStorageService.조회(folderId);
    const statistics = await this.folderDomainService.통계조회(folderId);

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
    // 1. 기본값 설정 (유효성 검증은 DTO에서 처리)
    const {
      sortBy = query.sortBy ?? SortBy.NAME,
      sortOrder = query.sortOrder ?? SortOrder.ASC,
      page = query.page ?? 1,
      pageSize = query.pageSize ?? 50,
    } = query;

    // 2. 폴더 존재 확인
    const folder = await this.folderDomainService.조회(folderId);
    if (!folder || folder.isTrashed()) {
      throw BusinessException.of(ErrorCodes.FOLDER_NOT_FOUND, { folderId });
    }

    // 3. 브레드크럼 생성
    const breadcrumbs = await this.getBreadcrumbs(folderId);

    // 4. 하위 폴더 조회
    const subFolders = await this.folderDomainService.하위폴더조회(folderId, FolderState.ACTIVE);
    const folderListItems = await this.mapToFolderListItems(subFolders);

    // 5. 파일 조회
    const files = await this.fileDomainService.폴더내파일조회(folderId, FileState.ACTIVE);
    const fileListItems = await this.mapToFileListItems(files);

    // 6. 정렬
    const sortedFolders = this.sortItems(folderListItems, sortBy, sortOrder);
    const sortedFiles = this.sortItems(fileListItems, sortBy, sortOrder);

    // 7. 페이지네이션 계산
    const totalItems = sortedFolders.length + sortedFiles.length;
    const offset = (page - 1) * pageSize;

    // 8. 페이지네이션 적용 (폴더 먼저, 그 다음 파일)
    const paginatedFolders = sortedFolders.slice(offset, offset + pageSize);
    const remainingPageSize = pageSize - paginatedFolders.length;
    const fileOffset = Math.max(0, offset - sortedFolders.length);
    const paginatedFiles = remainingPageSize > 0
      ? sortedFiles.slice(fileOffset, fileOffset + remainingPageSize)
      : [];

    // 9. 페이지네이션 정보 생성
    const pagination = createPaginationInfo(page, pageSize, totalItems);

    return {
      folderId: folder.id,
      path: folder.path,
      breadcrumbs,
      folders: paginatedFolders,
      files: paginatedFiles,
      pagination,
    };
  }

  /**
   * 브레드크럼 조회 (상위 폴더 체인)
   */
  async getBreadcrumbs(folderId: string): Promise<BreadcrumbItem[]> {
    const ancestors = await this.folderDomainService.상위폴더체인조회(folderId);
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
      const storageObject = await this.folderStorageService.조회(folder.id);
      const statistics = await this.folderDomainService.통계조회(folder.id);

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
   * 각 파일에 대한 PENDING 작업 요청 정보도 함께 조회하여 포함
   */
  private async mapToFileListItems(files: any[]): Promise<FileListItemInFolder[]> {
    if (files.length === 0) return [];

    // 파일 ID 목록으로 PENDING 요청을 한 번에 일괄 조회
    const fileIds = files.map((f) => f.id);
    const pendingRequests = await this.fileActionRequestDomainService.다건파일PENDING조회(fileIds);
    const pendingMap = new Map<string, FileActionRequest>(
      pendingRequests.map((r) => [r.fileId, r]),
    );

    const items: FileListItemInFolder[] = [];

    for (const file of files) {
      // Domain Service를 통해 스토리지 상태 조회
      const [cacheStorage, nasStorage] = await Promise.all([
        this.fileCacheStorageService.조회(file.id),
        this.fileNasStorageService.조회(file.id),
      ]);

      const pendingRequest = pendingMap.get(file.id);

      items.push({
        id: file.id,
        name: file.name,
        size: file.sizeBytes,
        mimeType: file.mimeType,
        storageStatus: {
          cache: cacheStorage?.availabilityStatus ?? null,
          nas: nasStorage?.availabilityStatus ?? null,
        },
        updatedAt: file.updatedAt.toISOString(),
        pendingActionRequest: pendingRequest
          ? {
              id: pendingRequest.id,
              type: pendingRequest.type as 'MOVE' | 'DELETE',
              status: 'PENDING',
              requestedAt: pendingRequest.requestedAt.toISOString(),
            }
          : null,
      });
    }

    return items;
  }

  /**
   * 아이템 정렬
   */
  private sortItems<T extends { name: string; updatedAt: string; size?: number; mimeType?: string }>(
    items: T[],
    sortBy: SortBy,
    sortOrder: SortOrder,
  ): T[] {
    return [...items].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case SortBy.NAME:
          comparison = a.name.localeCompare(b.name);
          break;
        case SortBy.TYPE:
          // 폴더는 mimeType이 없으므로 'folder'로 처리
          const typeA = a.mimeType ?? 'folder';
          const typeB = b.mimeType ?? 'folder';
          comparison = typeA.localeCompare(typeB);
          break;
        case SortBy.CREATED_AT:
          // createdAt이 없으면 updatedAt으로 대체
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case SortBy.UPDATED_AT:
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case SortBy.SIZE:
          // 폴더는 size가 없으므로 0으로 처리
          const sizeA = a.size ?? 0;
          const sizeB = b.size ?? 0;
          comparison = sizeA - sizeB;
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === SortOrder.DESC ? -comparison : comparison;
    });
  }
}
