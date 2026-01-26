import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  FolderEntity,
  FolderStorageObjectEntity,
  FolderState,
  FolderAvailabilityStatus,
  CreateFolderRequest,
  CreateFolderResponse,
  RenameFolderRequest,
  RenameFolderResponse,
  MoveFolderRequest,
  MoveFolderResponse,
  FolderConflictStrategy,
  MoveFolderConflictStrategy,
  FOLDER_REPOSITORY,
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/folder';
import {
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/file';
import {
  TrashMetadataFactory,
  TRASH_REPOSITORY,
} from '../../domain/trash';

import type {
  IFileRepository,
  IFileStorageObjectRepository,
} from '../../domain/file';
import type {
  IFolderRepository,
  IFolderStorageObjectRepository,
} from '../../domain/folder';
import type {
  ITrashRepository,
} from '../../domain/trash';



/**
 * 폴더 명령 비즈니스 서비스
 * 폴더 생성, 이름 변경, 이동, 삭제 처리
 */
@Injectable()
export class FolderCommandService implements OnModuleInit {
  private readonly logger = new Logger(FolderCommandService.name);

  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(FOLDER_STORAGE_OBJECT_REPOSITORY)
    private readonly folderStorageObjectRepository: IFolderStorageObjectRepository,
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(TRASH_REPOSITORY)
    private readonly trashRepository: ITrashRepository,
  ) { }

  async onModuleInit() {
    await this.ensureRootFolderExists();
  }

  /**
   * 루트 폴더 존재 확인 및 생성
   */
  private async ensureRootFolderExists(): Promise<void> {
    try {
      const rootFolder = await this.folderRepository.findOne({ parentId: null });
      
      if (!rootFolder) {
        this.logger.log('Root folder not found. Creating root folder...');
        
        const folderId = uuidv4();
        const folder = new FolderEntity({
          id: folderId,
          name: '/',
          parentId: null,
          path: '/',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await this.folderRepository.save(folder);
        
        // NAS 스토리지 객체 생성 (루트 폴더용)
        const storageObject = new FolderStorageObjectEntity({
          id: uuidv4(),
          folderId,
          storageType: 'NAS',
          objectKey: '/',
          availabilityStatus: FolderAvailabilityStatus.AVAILABLE, // 루트는 이미 존재한다고 가정
          createdAt: new Date(),
        });

        await this.folderStorageObjectRepository.save(storageObject);
        
        this.logger.log(`Root folder created with ID: ${folderId}`);
      } else {
        this.logger.log(`Root folder already exists with ID: ${rootFolder.id}`);
      }
    } catch (error) {
      this.logger.error('Failed to ensure root folder exists', error);
    }
  }

  /**
   * 폴더 생성
   */
  async 생성(request: CreateFolderRequest, userId: string): Promise<CreateFolderResponse> {
    const { name, parentId, conflictStrategy = FolderConflictStrategy.ERROR } = request;

    // 1. 폴더명 유효성 검사
    this.validateFolderName(name);

    // 2. 상위 폴더 존재 확인
    let parentPath = '';
    if (parentId) {
      const parent = await this.folderRepository.findById(parentId);
      if (!parent || !parent.isActive()) {
        throw new NotFoundException({
          code: 'PARENT_FOLDER_NOT_FOUND',
          message: '상위 폴더를 찾을 수 없습니다.',
        });
      }
      parentPath = parent.path;
    }

    // 3. 동일 이름 폴더 존재 확인
    const finalName = await this.resolveFolderName(parentId, name, conflictStrategy);

    // 4. 폴더 생성
    const folderId = uuidv4();
    const folderPath = parentPath ? `${parentPath}/${finalName}` : `/${finalName}`;

    const folder = new FolderEntity({
      id: folderId,
      name: finalName,
      parentId,
      path: folderPath,
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.folderRepository.save(folder);

    // 5. NAS 스토리지 객체 생성
    const storageObject = new FolderStorageObjectEntity({
      id: uuidv4(),
      folderId,
      storageType: 'NAS',
      objectKey: folderPath,
      availabilityStatus: FolderAvailabilityStatus.SYNCING,
      createdAt: new Date(),
    });

    await this.folderStorageObjectRepository.save(storageObject);

    // 6. TODO: Bull 큐 등록 (NAS_SYNC_MKDIR)
    // await this.nasQueue.add('NAS_SYNC_MKDIR', { folderId, path: folderPath });

    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      storageStatus: {
        nas: 'SYNCING',
      },
      createdAt: folder.createdAt.toISOString(),
    };
  }

  /**
   * 폴더명 변경
   */
  async 이름변경(folderId: string, request: RenameFolderRequest, userId: string): Promise<RenameFolderResponse> {
    const { newName, conflictStrategy = FolderConflictStrategy.ERROR } = request;

    // 1. 폴더명 유효성 검사
    this.validateFolderName(newName);

    // 2. 폴더 조회 (락)
    const folder = await this.folderRepository.findByIdForUpdate(folderId);
    if (!folder) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '폴더를 찾을 수 없습니다.',
      });
    }

    if (!folder.isActive()) {
      throw new BadRequestException({
        code: 'FOLDER_NOT_ACTIVE',
        message: '활성 상태의 폴더만 이름을 변경할 수 있습니다.',
      });
    }

    // 3. NAS 동기화 상태 체크
    await this.checkNasSyncStatus(folderId);

    // 4. 동일 이름 폴더 존재 확인
    const finalName = await this.resolveFolderNameForRename(
      folder.parentId,
      newName,
      folderId,
      conflictStrategy,
    );

    // 5. 새 경로 계산
    const oldPath = folder.path;
    const parentPath = folder.parentId
      ? oldPath.substring(0, oldPath.lastIndexOf('/'))
      : '';
    const newPath = parentPath ? `${parentPath}/${finalName}` : `/${finalName}`;

    // 6. 폴더명 업데이트
    folder.rename(finalName, newPath);
    await this.folderRepository.save(folder);

    // 7. 하위 폴더 경로 일괄 업데이트
    await this.folderRepository.updatePathByPrefix(oldPath, newPath);



    return {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      storageStatus: {
        nas: 'SYNCING',
      },
      updatedAt: folder.updatedAt.toISOString(),
    };
  }

  /**
   * 폴더 이동
   */
  async 이동(folderId: string, request: MoveFolderRequest, userId: string): Promise<MoveFolderResponse> {
    const { targetParentId, conflictStrategy = MoveFolderConflictStrategy.ERROR } = request;

    // 1. 대상 상위 폴더 존재 확인
    const targetParent = await this.folderRepository.findById(targetParentId);
    if (!targetParent || !targetParent.isActive()) {
      throw new NotFoundException({
        code: 'TARGET_FOLDER_NOT_FOUND',
        message: '대상 폴더를 찾을 수 없습니다.',
      });
    }

    // 2. 폴더 조회 (락)
    const folder = await this.folderRepository.findByIdForUpdate(folderId);
    if (!folder) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '폴더를 찾을 수 없습니다.',
      });
    }

    if (!folder.isActive()) {
      throw new BadRequestException({
        code: 'FOLDER_NOT_ACTIVE',
        message: '활성 상태의 폴더만 이동할 수 있습니다.',
      });
    }

    // 3. 순환 이동 방지 체크
    if (targetParent.path.startsWith(folder.path + '/') || targetParent.id === folder.id) {
      throw new ConflictException({
        code: 'CIRCULAR_MOVE',
        message: '자기 자신 또는 하위 폴더로 이동할 수 없습니다.',
      });
    }

    // 4. NAS 동기화 상태 체크
    await this.checkNasSyncStatus(folderId);

    // 5. 충돌 처리
    const { finalName, skipped } = await this.resolveConflictForMove(
      targetParentId,
      folder.name,
      conflictStrategy,
    );

    if (skipped) {
      return {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId || '',
        path: folder.path,
        skipped: true,
        reason: '동일한 이름의 폴더가 이미 존재합니다.',
        storageStatus: { nas: 'SYNCING' },
        updatedAt: folder.updatedAt.toISOString(),
      };
    }

    // 6. 새 경로 계산
    const oldPath = folder.path;
    const newPath = `${targetParent.path}/${finalName}`;

    // 7. 폴더 이동
    folder.moveTo(targetParentId, newPath);
    if (finalName !== folder.name) {
      folder.rename(finalName, newPath);
    }
    await this.folderRepository.save(folder);

    // 8. 하위 폴더 경로 일괄 업데이트
    await this.folderRepository.updatePathByPrefix(oldPath, newPath);

    // 9. NAS 상태 업데이트
    const storageObject = await this.folderStorageObjectRepository.findByFolderId(folderId);
    if (storageObject) {
      storageObject.updateStatus(FolderAvailabilityStatus.SYNCING);
      storageObject.updateObjectKey(newPath);
      await this.folderStorageObjectRepository.save(storageObject);
    }

    // 10. TODO: Bull 큐 등록 (NAS_SYNC_MOVE_DIR)
    // await this.nasQueue.add('NAS_SYNC_MOVE_DIR', { folderId, oldPath, newPath });

    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId || '',
      path: folder.path,
      storageStatus: {
        nas: 'SYNCING',
      },
      updatedAt: folder.updatedAt.toISOString(),
    };
  }

  /**
   * 폴더 삭제 (휴지통 이동)
   */
  async delete(folderId: string, userId: string): Promise<{
    id: string;
    name: string;
    state: FolderState;
    trashedAt: string;
  }> {
    // 1. 폴더 조회 (락)
    const folder = await this.folderRepository.findByIdForUpdate(folderId);
    if (!folder) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: '폴더를 찾을 수 없습니다.',
      });
    }

    if (folder.isTrashed()) {
      throw new BadRequestException({
        code: 'FOLDER_ALREADY_TRASHED',
        message: '이미 휴지통에 있는 폴더입니다.',
      });
    }

    if (!folder.isActive()) {
      throw new BadRequestException({
        code: 'FOLDER_NOT_ACTIVE',
        message: '활성 상태의 폴더만 삭제할 수 있습니다.',
      });
    }

    // // 3. 하위 폴더 조회
    // const descendants = await this.folderRepository.findAllDescendants(folderId, FolderState.ACTIVE);
    // const allFolderIds = [folderId, ...descendants.map(f => f.id)];

    // // 4. 폴더 상태 변경 (TRASHED)
    // folder.delete();
    // await this.folderRepository.save(folder);
    // await this.folderRepository.updateStateByIds(descendants.map(f => f.id), FolderState.TRASHED);

    // // 5. 하위 파일 상태 변경 (TRASHED)
    // const affectedFileCount = await this.fileRepository.updateStateByFolderIds(
    //   allFolderIds,
    //   FileState.TRASHED,
    // );

    // 6. trash_metadata 생성 (최상위 폴더만)
    const trashMetadata = TrashMetadataFactory.createForFolder({
      id: uuidv4(),
      folderId: folder.id,
      originalPath: folder.path,
      originalParentId: folder.parentId,
      deletedBy: userId,
    });
    await this.trashRepository.save(trashMetadata);

    return {
      id: folder.id,
      name: folder.name,
      state: folder.state,
      trashedAt: folder.updatedAt.toISOString(),
    };
  }

  /**
   * 폴더명 유효성 검사
   */
  private validateFolderName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_FOLDER_NAME',
        message: '폴더명은 비워둘 수 없습니다.',
      });
    }

    // 특수문자 검사
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) {
      throw new BadRequestException({
        code: 'INVALID_FOLDER_NAME',
        message: '폴더명에 사용할 수 없는 문자가 포함되어 있습니다.',
      });
    }

    // 길이 검사
    if (name.length > 255) {
      throw new BadRequestException({
        code: 'INVALID_FOLDER_NAME',
        message: '폴더명은 255자를 초과할 수 없습니다.',
      });
    }
  }

  /**
   * NAS 동기화 상태 체크
   */
  private async checkNasSyncStatus(folderId: string): Promise<void> {
    const storageObject = await this.folderStorageObjectRepository.findByFolderIdForUpdate(folderId);

    if (storageObject && storageObject.isSyncing()) {
      throw new ConflictException({
        code: 'FOLDER_SYNCING',
        message: '폴더가 동기화 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }
  }

  /**
   * 폴더명 충돌 해결 (생성 시)
   */
  private async resolveFolderName(
    parentId: string | null,
    name: string,
    conflictStrategy: FolderConflictStrategy,
  ): Promise<string> {
    const exists = await this.folderRepository.existsByNameInParent(parentId, name);

    if (!exists) {
      return name;
    }

    if (conflictStrategy === FolderConflictStrategy.ERROR) {
      throw new ConflictException({
        code: 'DUPLICATE_FOLDER_EXISTS',
        message: '동일한 이름의 폴더가 이미 존재합니다.',
      });
    }

    return this.generateUniqueFolderName(parentId, name);
  }

  /**
   * 폴더명 충돌 해결 (변경 시)
   */
  private async resolveFolderNameForRename(
    parentId: string | null,
    name: string,
    excludeFolderId: string,
    conflictStrategy: FolderConflictStrategy,
  ): Promise<string> {
    const exists = await this.folderRepository.existsByNameInParent(parentId, name, excludeFolderId);

    if (!exists) {
      return name;
    }

    if (conflictStrategy === FolderConflictStrategy.ERROR) {
      throw new ConflictException({
        code: 'DUPLICATE_FOLDER_EXISTS',
        message: '동일한 이름의 폴더가 이미 존재합니다.',
      });
    }

    return this.generateUniqueFolderName(parentId, name, excludeFolderId);
  }

  /**
   * 폴더 이동 시 충돌 해결
   */
  private async resolveConflictForMove(
    targetParentId: string,
    folderName: string,
    conflictStrategy: MoveFolderConflictStrategy,
  ): Promise<{ finalName: string; skipped: boolean }> {
    const exists = await this.folderRepository.existsByNameInParent(targetParentId, folderName);

    if (!exists) {
      return { finalName: folderName, skipped: false };
    }

    switch (conflictStrategy) {
      case MoveFolderConflictStrategy.ERROR:
        throw new ConflictException({
          code: 'DUPLICATE_FOLDER_EXISTS',
          message: '동일한 이름의 폴더가 이미 존재합니다.',
        });

      case MoveFolderConflictStrategy.SKIP:
        return { finalName: folderName, skipped: true };

      case MoveFolderConflictStrategy.RENAME:
        const uniqueName = await this.generateUniqueFolderName(targetParentId, folderName);
        return { finalName: uniqueName, skipped: false };

      default:
        return { finalName: folderName, skipped: false };
    }
  }

  /**
   * 고유 폴더명 생성
   */
  private async generateUniqueFolderName(
    parentId: string | null,
    baseName: string,
    excludeFolderId?: string,
  ): Promise<string> {
    let counter = 1;
    let newName = `${baseName} (${counter})`;

    while (await this.folderRepository.existsByNameInParent(parentId, newName, excludeFolderId)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }

    return newName;
  }
}
