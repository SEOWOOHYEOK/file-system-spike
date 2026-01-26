import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  TrashListResponse,
  TrashItem,
  GetTrashListQuery,
  TrashFolderContentsResponse,
  FileRestoreInfoResponse,
  FolderRestoreInfoResponse,
  FileRestoreRequest,
  FolderRestoreRequest,
  RestoreResponse,
  RestoreAllResponse,
  PurgeResponse,
  EmptyTrashResponse,
  PathStatus,
  FolderRestoreStrategy,
  TRASH_REPOSITORY,
  TRASH_QUERY_SERVICE,
} from '../../domain/trash';
import type { ITrashRepository, ITrashQueryService } from '../../domain/trash';
import {
  FileEntity,
  FileState,
  StorageType,
  AvailabilityStatus,
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/file';
import type { IFileRepository, IFileStorageObjectRepository } from '../../domain/file';
import {
  FolderEntity,
  FolderState,
  FolderAvailabilityStatus,
  FOLDER_REPOSITORY,
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/folder';
import type { IFolderRepository, IFolderStorageObjectRepository } from '../../domain/folder';

/**
 * 휴지통 비즈니스 서비스
 * 휴지통 목록 조회, 복원, 영구삭제, 휴지통 비우기
 */
@Injectable()
export class TrashService {
  constructor(
    @Inject(TRASH_REPOSITORY)
    private readonly trashRepository: ITrashRepository,
    @Inject(TRASH_QUERY_SERVICE)
    private readonly trashQueryService: ITrashQueryService,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(FOLDER_STORAGE_OBJECT_REPOSITORY)
    private readonly folderStorageObjectRepository: IFolderStorageObjectRepository,
  ) { }

  /**
   * 휴지통 목록 조회
   */
  async getTrashList(query: GetTrashListQuery): Promise<TrashListResponse> {
    // 기본값 설정
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const sortBy = query.sortBy ?? 'deletedAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const result = await this.trashQueryService.getTrashList({
      sortBy,
      order: sortOrder,
      page,
      limit: pageSize,
    });

    const items: TrashItem[] = result.items.map(item => ({
      type: item.type,
      id: item.id,
      name: item.name,
      sizeBytes: item.sizeBytes,
      mimeType: item.mimeType,
      trashMetadataId: item.trashMetadataId,
      originalPath: item.originalPath,
      deletedAt: item.deletedAt.toISOString(),
      deletedBy: item.deletedBy,
      modifiedAt: item.modifiedAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
    }));

    // 페이지네이션 정보 계산
    const totalItems = result.totalCount;
    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items,
      totalSizeBytes: result.totalSizeBytes,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }


  /**
   * 파일 복원 정보 조회
   */
  async getFileRestoreInfo(trashMetadataId: string): Promise<FileRestoreInfoResponse> {
    const trashMetadata = await this.trashRepository.findById(trashMetadataId);
    if (!trashMetadata || !trashMetadata.isFile()) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    const file = await this.fileRepository.findById(trashMetadata.fileId!);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    // 원래 폴더 존재 확인
    const originalFolder = await this.folderRepository.findById(trashMetadata.originalFolderId!);
    const pathStatus = originalFolder && originalFolder.isActive() && originalFolder.path === this.getParentPath(trashMetadata.originalPath)
      ? PathStatus.AVAILABLE
      : PathStatus.PATH_NOT_FOUND;

    // 충돌 확인
    let hasConflict = false;
    let conflictFileName: string | undefined;

    if (pathStatus === PathStatus.AVAILABLE) {
      hasConflict = await this.fileRepository.existsByNameInFolder(
        trashMetadata.originalFolderId!,
        file.name,
        file.mimeType,
      );
      if (hasConflict) {
        conflictFileName = file.name;
      }
    }

    return {
      trashId: trashMetadataId,
      fileName: file.name,
      originalPath: trashMetadata.originalPath,
      originalFolderId: trashMetadata.originalFolderId!,
      pathStatus,
      hasConflict,
      conflictFileName,
    };
  }

  /**
   * 파일 복원
   */
  async restoreFile(trashMetadataId: string, request: FileRestoreRequest, userId: string): Promise<RestoreResponse> {
    const trashMetadata = await this.trashRepository.findById(trashMetadataId);
    if (!trashMetadata || !trashMetadata.isFile()) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    const file = await this.fileRepository.findById(trashMetadata.fileId!);
    if (!file || !file.isTrashed()) {
      throw new BadRequestException({
        code: 'FILE_NOT_IN_TRASH',
        message: '휴지통에 있는 파일만 복원할 수 있습니다.',
      });
    }

    // NAS 동기화 상태 체크
    await this.checkFileNasSyncStatus(file.id);

    const finalName = request.newFileName || file.name;
    let targetFolderId = trashMetadata.originalFolderId!;

    // 원래 폴더가 없으면 경로 생성
    const originalFolder = await this.folderRepository.findById(targetFolderId);
    if (!originalFolder || !originalFolder.isActive()) {
      targetFolderId = await this.recreateFolderPath(trashMetadata.originalPath, userId);
    }

    // 파일 복원
    file.restore();
    file.moveTo(targetFolderId);
    if (finalName !== file.name) {
      file.rename(finalName);
    }
    await this.fileRepository.save(file);

    // trash_metadata 삭제
    await this.trashRepository.delete(trashMetadataId);

    // NAS 상태 업데이트 (MOVING)
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      file.id,
      StorageType.NAS,
    );
    if (nasObject) {
      nasObject.updateStatus(AvailabilityStatus.MOVING);
      await this.fileStorageObjectRepository.save(nasObject);
    }

    // TODO: Bull 큐 등록 (NAS_RESTORE_FILE)
    // await this.nasQueue.add('NAS_RESTORE_FILE', { fileId: file.id, trashPath, restorePath });

    const folder = await this.folderRepository.findById(targetFolderId);
    const path = folder ? `${folder.path}/${finalName}` : `/${finalName}`;

    return {
      id: file.id,
      name: file.name,
      path,
      restoredAt: new Date().toISOString(),
    };
  }

  /**
   * 폴더 복원 정보 조회
   */
  async getFolderRestoreInfo(trashMetadataId: string): Promise<FolderRestoreInfoResponse> {
    const trashMetadata = await this.trashRepository.findById(trashMetadataId);
    if (!trashMetadata || !trashMetadata.isFolder()) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    const folder = await this.folderRepository.findById(trashMetadata.folderId!);
    if (!folder) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '폴더를 찾을 수 없습니다.',
      });
    }

    // 상위 폴더 존재 확인
    const originalParent = trashMetadata.originalParentId
      ? await this.folderRepository.findById(trashMetadata.originalParentId)
      : null;
    const parentPathStatus = !trashMetadata.originalParentId || (originalParent && originalParent.isActive())
      ? PathStatus.AVAILABLE
      : PathStatus.PATH_NOT_FOUND;

    // 충돌 확인
    let hasConflict = false;
    let conflictFolderId: string | undefined;
    let conflictFolderName: string | undefined;

    if (parentPathStatus === PathStatus.AVAILABLE) {
      hasConflict = await this.folderRepository.existsByNameInParent(
        trashMetadata.originalParentId || null,
        folder.name,
      );
      if (hasConflict) {
        conflictFolderName = folder.name;
      }
    }

    // 하위 항목 수 계산
    const descendants = await this.folderRepository.findAllDescendants(folder.id, FolderState.TRASHED);
    const allFolderIds = [folder.id, ...descendants.map(f => f.id)];

    let fileCount = 0;
    for (const fId of allFolderIds) {
      const files = await this.fileRepository.findByFolderId(fId, FileState.TRASHED);
      fileCount += files.length;
    }

    return {
      trashId: trashMetadataId,
      folderName: folder.name,
      originalPath: trashMetadata.originalPath,
      originalParentId: trashMetadata.originalParentId || '',
      parentPathStatus,
      hasConflict,
      conflictFolderId,
      conflictFolderName,
      childCount: {
        files: fileCount,
        folders: descendants.length,
      },
    };
  }

  /**
   * 폴더 복원
   */
  async restoreFolder(trashMetadataId: string, request: FolderRestoreRequest, userId: string): Promise<RestoreResponse> {
    const trashMetadata = await this.trashRepository.findById(trashMetadataId);
    if (!trashMetadata || !trashMetadata.isFolder()) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    const folder = await this.folderRepository.findById(trashMetadata.folderId!);
    if (!folder || !folder.isTrashed()) {
      throw new BadRequestException({
        code: 'FOLDER_NOT_IN_TRASH',
        message: '휴지통에 있는 폴더만 복원할 수 있습니다.',
      });
    }

    // NAS 동기화 상태 체크
    await this.checkFolderNasSyncStatus(folder.id);

    const finalName = request.newFolderName || folder.name;
    let targetParentId = trashMetadata.originalParentId || null;

    // 경로 처리
    if (request.restoreStrategy === FolderRestoreStrategy.CHOOSE_LOCATION && request.targetParentId) {
      targetParentId = request.targetParentId;
    } else if (request.restoreStrategy === FolderRestoreStrategy.RECREATE_PATH || !targetParentId) {
      const parentPath = this.getParentPath(trashMetadata.originalPath);
      if (parentPath) {
        targetParentId = await this.recreateFolderPath(parentPath, userId);
      }
    }

    // 하위 폴더/파일 조회
    const descendants = await this.folderRepository.findAllDescendants(folder.id, FolderState.TRASHED);
    const allFolderIds = [folder.id, ...descendants.map(f => f.id)];

    // 폴더 복원
    const targetParent = targetParentId ? await this.folderRepository.findById(targetParentId) : null;
    const newPath = targetParent ? `${targetParent.path}/${finalName}` : `/${finalName}`;
    const oldPath = folder.path;

    folder.restore();
    folder.moveTo(targetParentId || '', newPath);
    if (finalName !== folder.name) {
      folder.rename(finalName, newPath);
    }
    await this.folderRepository.save(folder);

    // 하위 폴더 복원 및 경로 업데이트
    await this.folderRepository.updateStateByIds(descendants.map(f => f.id), FolderState.ACTIVE);
    await this.folderRepository.updatePathByPrefix(oldPath, newPath);

    // 하위 파일 복원
    await this.fileRepository.updateStateByFolderIds(allFolderIds, FileState.ACTIVE);

    // trash_metadata 삭제
    await this.trashRepository.delete(trashMetadataId);

    // NAS 상태 업데이트 (MOVING)
    await this.folderStorageObjectRepository.updateStatusByFolderIds(
      allFolderIds,
      FolderAvailabilityStatus.MOVING,
    );

    // TODO: Bull 큐 등록 (NAS_RESTORE_FOLDER)
    // await this.nasQueue.add('NAS_RESTORE_FOLDER', { folderId, trashPath, restorePath, allFolderIds });

    return {
      id: folder.id,
      name: folder.name,
      path: newPath,
      restoredAt: new Date().toISOString(),
    };
  }

  /**
   * 파일 영구삭제
   */
  async purgeFile(trashMetadataId: string, userId: string): Promise<PurgeResponse> {
    const trashMetadata = await this.trashRepository.findById(trashMetadataId);
    if (!trashMetadata || !trashMetadata.isFile()) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    const file = await this.fileRepository.findById(trashMetadata.fileId!);
    if (!file || !file.isTrashed()) {
      throw new BadRequestException({
        code: 'FILE_NOT_IN_TRASH',
        message: '휴지통에 있는 파일만 영구 삭제할 수 있습니다.',
      });
    }

    // NAS 동기화 상태 체크
    await this.checkFileNasSyncStatus(file.id);

    // 파일 상태 변경 (DELETED)
    file.permanentDelete();
    await this.fileRepository.save(file);

    // trash_metadata 삭제
    await this.trashRepository.delete(trashMetadataId);

    // 캐시 스토리지 상태 변경 (PENDING)
    const cacheObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      file.id,
      StorageType.CACHE,
    );
    if (cacheObject) {
      cacheObject.updateStatus(AvailabilityStatus.PENDING);
      await this.fileStorageObjectRepository.save(cacheObject);
    }

    // TODO: SeaweedFS 삭제
    // TODO: Bull 큐 등록 (NAS_PURGE)

    return {
      id: file.id,
      name: file.name,
      type: 'FILE',
      purgedAt: new Date().toISOString(),
    };
  }

  /**
   * 폴더 영구삭제
   */
  async purgeFolder(trashMetadataId: string, userId: string): Promise<PurgeResponse> {
    const trashMetadata = await this.trashRepository.findById(trashMetadataId);
    if (!trashMetadata || !trashMetadata.isFolder()) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    const folder = await this.folderRepository.findById(trashMetadata.folderId!);
    if (!folder || !folder.isTrashed()) {
      throw new BadRequestException({
        code: 'FOLDER_NOT_IN_TRASH',
        message: '휴지통에 있는 폴더만 영구 삭제할 수 있습니다.',
      });
    }

    // NAS 동기화 상태 체크
    await this.checkFolderNasSyncStatus(folder.id);

    // 하위 폴더/파일 조회
    const descendants = await this.folderRepository.findAllDescendants(folder.id, FolderState.TRASHED);
    const allFolderIds = [folder.id, ...descendants.map(f => f.id)];

    // 하위 파일 상태 변경 (DELETED)
    await this.fileRepository.updateStateByFolderIds(allFolderIds, FileState.DELETED);

    // 폴더 상태 변경 (DELETED)
    folder.permanentDelete();
    await this.folderRepository.save(folder);
    await this.folderRepository.updateStateByIds(descendants.map(f => f.id), FolderState.DELETED);

    // trash_metadata 삭제
    await this.trashRepository.delete(trashMetadataId);

    // TODO: SeaweedFS 삭제 (하위 파일들)
    // TODO: Bull 큐 등록 (NAS_PURGE_FOLDER)

    return {
      id: folder.id,
      name: folder.name,
      type: 'FOLDER',
      purgedAt: new Date().toISOString(),
    };
  }

  /**
   * 휴지통 비우기
   */
  async emptyTrash(userId: string): Promise<EmptyTrashResponse> {
    const trashItems = await this.trashRepository.findAll();

    let success = 0;
    let failed = 0;

    for (const item of trashItems) {
      try {
        if (item.isFile()) {
          await this.purgeFile(item.id, userId);
        } else {
          await this.purgeFolder(item.id, userId);
        }
        success++;
      } catch (error) {
        failed++;
        console.error(`휴지통 비우기 실패: ${item.id}`, error);
      }
    }

    return {
      message: `휴지통 비우기 완료: ${success}건 삭제, ${failed}건 실패`,
      success,
      failed,
    };
  }

  /**
   * 모든 항목 복원
   */
  async restoreAll(userId: string): Promise<RestoreAllResponse> {
    const trashItems = await this.trashRepository.findAll();

    let restored = 0;
    let skipped = 0;
    let failed = 0;
    const skippedItems: RestoreAllResponse['skippedItems'] = [];

    for (const item of trashItems) {
      try {
        // 복원 정보 조회
        const restoreInfo = item.isFile()
          ? await this.getFileRestoreInfo(item.id)
          : await this.getFolderRestoreInfo(item.id);

        // 충돌 있으면 skip
        if (restoreInfo.hasConflict) {
          skipped++;
          skippedItems.push({
            id: item.id,
            name: item.isFile()
              ? (restoreInfo as FileRestoreInfoResponse).fileName
              : (restoreInfo as FolderRestoreInfoResponse).folderName,
            reason: 'CONFLICT',
            conflictWith: item.isFile()
              ? (restoreInfo as FileRestoreInfoResponse).conflictFileName || ''
              : (restoreInfo as FolderRestoreInfoResponse).conflictFolderName || '',
          });
          continue;
        }

        // 복원 실행
        if (item.isFile()) {
          await this.restoreFile(item.id, {}, userId);
        } else {
          await this.restoreFolder(item.id, { restoreStrategy: FolderRestoreStrategy.RECREATE_PATH }, userId);
        }
        restored++;
      } catch (error) {
        failed++;
        console.error(`복원 실패: ${item.id}`, error);
      }
    }

    return {
      message: `복원 완료: ${restored}건 성공, ${skipped}건 건너뜀, ${failed}건 실패`,
      restored,
      skipped,
      failed,
      skippedItems,
    };
  }

  /**
   * 부모 경로 추출
   */
  private getParentPath(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash > 0 ? path.substring(0, lastSlash) : '';
  }

  /**
   * 폴더 경로 재생성
   */
  private async recreateFolderPath(path: string, userId: string): Promise<string> {
    const parts = path.split('/').filter(p => p);
    let parentId: string | null = null;
    let currentPath = '';

    for (const part of parts) {
      currentPath += `/${part}`;

      // 기존 폴더 확인
      const existingFolder = await this.folderRepository.findOne({
        parentId,
        name: part,
        state: FolderState.ACTIVE,
      });

      if (existingFolder) {
        parentId = existingFolder.id;
        continue;
      }

      // 새 폴더 생성
      const newFolder = new FolderEntity({
        id: uuidv4(),
        name: part,
        parentId,
        path: currentPath,
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await this.folderRepository.save(newFolder);
      parentId = newFolder.id;
    }

    return parentId || '';
  }

  /**
   * 파일 NAS 동기화 상태 체크
   */
  private async checkFileNasSyncStatus(fileId: string): Promise<void> {
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.NAS,
    );

    if (nasObject && !nasObject.isAvailable()) {
      throw new ConflictException({
        code: 'FILE_SYNCING',
        message: '파일이 동기화 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }
  }

  /**
   * 폴더 NAS 동기화 상태 체크
   */
  private async checkFolderNasSyncStatus(folderId: string): Promise<void> {
    const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);

    if (storageObject && !storageObject.isAvailable()) {
      throw new ConflictException({
        code: 'FOLDER_SYNCING',
        message: '폴더가 동기화 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }
  }
}
