import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  FileEntity,
  FileState,
  StorageType,
  AvailabilityStatus,
  RenameFileRequest,
  RenameFileResponse,
  MoveFileRequest,
  MoveFileResponse,
  MoveConflictStrategy,
  ConflictStrategy,
  FILE_REPOSITORY,
  FILE_STORAGE_OBJECT_REPOSITORY,
  IFileRepository,
  IFileStorageObjectRepository,
} from '../../domain/file';
import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../../domain/folder';
import {
  TrashMetadataFactory,
  TRASH_REPOSITORY,
  ITrashRepository,
} from '../../domain/trash';

/**
 * 파일 관리 비즈니스 서비스
 * 파일명 변경, 파일 이동, 파일 삭제(휴지통) 처리
 */
@Injectable()
export class FileManageService {
  constructor(
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(TRASH_REPOSITORY)
    private readonly trashRepository: ITrashRepository,
  ) {}

  /**
   * 파일명 변경
   * 
   * 처리 플로우:
   * 1. 파일 락 획득
   * 2. NAS 동기화 상태 체크
   * 3. 동일 파일명 존재 확인
   * 4. 파일명 업데이트
   * 5. NAS 경로 + 동기화 상태 업데이트
   * 6. Bull 큐 등록 (NAS 동기화)
   */
  async rename(fileId: string, request: RenameFileRequest, userId: string): Promise<RenameFileResponse> {
    const { newName, conflictStrategy = ConflictStrategy.ERROR } = request;

    // 1. 파일 조회 (락)
    const file = await this.fileRepository.findByIdForUpdate(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    if (!file.isActive()) {
      throw new BadRequestException({
        code: 'FILE_NOT_ACTIVE',
        message: '활성 상태의 파일만 이름을 변경할 수 있습니다.',
      });
    }

    // 2. NAS 동기화 상태 체크
    await this.checkNasSyncStatus(fileId);

    // 3. 동일 파일명 존재 확인
    const finalName = await this.resolveFileNameForRename(
      file.folderId,
      newName,
      file.mimeType,
      fileId,
      conflictStrategy,
    );

    // 4. 파일명 업데이트
    file.rename(finalName);
    await this.fileRepository.save(file);

    // 5. NAS 상태 업데이트
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.NAS,
    );
    if (nasObject) {
      nasObject.updateStatus(AvailabilityStatus.SYNCING);
      await this.fileStorageObjectRepository.save(nasObject);
    }

    // 6. TODO: Bull 큐 등록 (NAS_SYNC_RENAME)
    // await this.nasQueue.add('NAS_SYNC_RENAME', { fileId, oldName, newName });

    const folder = await this.folderRepository.findById(file.folderId);
    const filePath = folder ? `${folder.path}/${finalName}` : `/${finalName}`;

    return {
      id: file.id,
      name: file.name,
      path: filePath,
      storageStatus: {
        nas: 'SYNCING',
      },
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  /**
   * 파일 이동
   * 
   * 처리 플로우:
   * 1. 대상 폴더 존재 확인
   * 2. 파일 락 획득
   * 3. NAS 동기화 상태 체크
   * 4. 동일 파일 존재 확인 + 충돌 처리
   * 5. 파일 이동 (폴더 변경)
   * 6. NAS 경로 + 동기화 상태 업데이트
   * 7. Bull 큐 등록 (NAS 동기화)
   */
  async move(fileId: string, request: MoveFileRequest, userId: string): Promise<MoveFileResponse> {
    const { targetFolderId, conflictStrategy = MoveConflictStrategy.ERROR } = request;

    // 1. 대상 폴더 존재 확인
    const targetFolder = await this.folderRepository.findById(targetFolderId);
    if (!targetFolder || !targetFolder.isActive()) {
      throw new NotFoundException({
        code: 'TARGET_FOLDER_NOT_FOUND',
        message: '대상 폴더를 찾을 수 없습니다.',
      });
    }

    // 2. 파일 조회 (락)
    const file = await this.fileRepository.findByIdForUpdate(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    if (!file.isActive()) {
      throw new BadRequestException({
        code: 'FILE_NOT_ACTIVE',
        message: '활성 상태의 파일만 이동할 수 있습니다.',
      });
    }

    // 3. NAS 동기화 상태 체크
    await this.checkNasSyncStatus(fileId);

    // 4. 충돌 처리
    const { finalName, skipped } = await this.resolveConflictForMove(
      targetFolderId,
      file.name,
      file.mimeType,
      conflictStrategy,
    );

    if (skipped) {
      return {
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        path: '',
        skipped: true,
        reason: '동일한 이름의 파일이 이미 존재합니다.',
        storageStatus: { nas: 'SYNCING' },
        updatedAt: file.updatedAt.toISOString(),
      };
    }

    // 5. 파일 이동
    file.moveTo(targetFolderId);
    if (finalName !== file.name) {
      file.rename(finalName);
    }
    await this.fileRepository.save(file);

    // 6. NAS 상태 업데이트
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.NAS,
    );
    if (nasObject) {
      nasObject.updateStatus(AvailabilityStatus.SYNCING);
      await this.fileStorageObjectRepository.save(nasObject);
    }

    // 7. TODO: Bull 큐 등록 (NAS_SYNC_MOVE)
    // await this.nasQueue.add('NAS_SYNC_MOVE', { fileId, sourceFolder, targetFolder });

    const filePath = `${targetFolder.path}/${finalName}`;

    return {
      id: file.id,
      name: file.name,
      folderId: file.folderId,
      path: filePath,
      storageStatus: {
        nas: 'SYNCING',
      },
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  /**
   * 파일 삭제 (휴지통 이동)
   * 
   * 처리 플로우:
   * 1. 파일 락 획득
   * 2. NAS 동기화 상태 체크
   * 3. 파일 상태 변경 (TRASHED)
   * 4. trash_metadata 생성
   * 5. NAS 상태 업데이트 (MOVING)
   * 6. Bull 큐 등록 (NAS 휴지통 이동)
   */
  async delete(fileId: string, userId: string): Promise<{
    id: string;
    name: string;
    state: FileState;
    trashedAt: string;
  }> {
    // 1. 파일 조회 (락)
    const file = await this.fileRepository.findByIdForUpdate(fileId);
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: '파일을 찾을 수 없습니다.',
      });
    }

    if (file.isTrashed()) {
      throw new BadRequestException({
        code: 'FILE_ALREADY_TRASHED',
        message: '이미 휴지통에 있는 파일입니다.',
      });
    }

    if (!file.isActive()) {
      throw new BadRequestException({
        code: 'FILE_NOT_ACTIVE',
        message: '활성 상태의 파일만 삭제할 수 있습니다.',
      });
    }

    // 2. NAS 동기화 상태 체크
    await this.checkNasSyncStatus(fileId);

    // 3. 원래 경로 저장
    const folder = await this.folderRepository.findById(file.folderId);
    const originalPath = folder ? `${folder.path}/${file.name}` : `/${file.name}`;

    // 4. 파일 상태 변경
    file.moveToTrash();
    await this.fileRepository.save(file);

    // 5. trash_metadata 생성
    const trashMetadata = TrashMetadataFactory.createForFile({
      id: uuidv4(),
      fileId: file.id,
      originalPath,
      originalFolderId: file.folderId,
      deletedBy: userId,
    });
    await this.trashRepository.save(trashMetadata);

    // 6. NAS 상태 업데이트
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
      fileId,
      StorageType.NAS,
    );
    if (nasObject) {
      nasObject.updateStatus(AvailabilityStatus.MOVING);
      await this.fileStorageObjectRepository.save(nasObject);
    }

    // 7. TODO: Bull 큐 등록 (NAS_MOVE_TO_TRASH)
    // await this.nasQueue.add('NAS_MOVE_TO_TRASH', { fileId, trashMetadataId });

    return {
      id: file.id,
      name: file.name,
      state: file.state,
      trashedAt: file.updatedAt.toISOString(),
    };
  }

  /**
   * NAS 동기화 상태 체크
   */
  private async checkNasSyncStatus(fileId: string): Promise<void> {
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndTypeForUpdate(
      fileId,
      StorageType.NAS,
    );

    if (nasObject && nasObject.isSyncing()) {
      throw new ConflictException({
        code: 'FILE_SYNCING',
        message: '파일이 동기화 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }
  }

  /**
   * 파일명 변경 시 충돌 해결
   */
  private async resolveFileNameForRename(
    folderId: string,
    newName: string,
    mimeType: string,
    excludeFileId: string,
    conflictStrategy: ConflictStrategy,
  ): Promise<string> {
    const exists = await this.fileRepository.existsByNameInFolder(
      folderId,
      newName,
      mimeType,
      excludeFileId,
    );

    if (!exists) {
      return newName;
    }

    if (conflictStrategy === ConflictStrategy.ERROR) {
      throw new ConflictException({
        code: 'DUPLICATE_FILE_EXISTS',
        message: '동일한 이름의 파일이 이미 존재합니다.',
      });
    }

    // RENAME 전략
    return this.generateUniqueFileName(folderId, newName, mimeType, excludeFileId);
  }

  /**
   * 파일 이동 시 충돌 해결
   */
  private async resolveConflictForMove(
    targetFolderId: string,
    fileName: string,
    mimeType: string,
    conflictStrategy: MoveConflictStrategy,
  ): Promise<{ finalName: string; skipped: boolean }> {
    const exists = await this.fileRepository.existsByNameInFolder(
      targetFolderId,
      fileName,
      mimeType,
    );

    if (!exists) {
      return { finalName: fileName, skipped: false };
    }

    switch (conflictStrategy) {
      case MoveConflictStrategy.ERROR:
        throw new ConflictException({
          code: 'DUPLICATE_FILE_EXISTS',
          message: '동일한 이름의 파일이 이미 존재합니다.',
        });

      case MoveConflictStrategy.SKIP:
        return { finalName: fileName, skipped: true };

      case MoveConflictStrategy.RENAME:
        const uniqueName = await this.generateUniqueFileName(
          targetFolderId,
          fileName,
          mimeType,
        );
        return { finalName: uniqueName, skipped: false };

      case MoveConflictStrategy.OVERWRITE:
        // TODO: 기존 파일 휴지통 이동 처리
        return { finalName: fileName, skipped: false };

      default:
        return { finalName: fileName, skipped: false };
    }
  }

  /**
   * 고유 파일명 생성
   */
  private async generateUniqueFileName(
    folderId: string,
    baseName: string,
    mimeType: string,
    excludeFileId?: string,
  ): Promise<string> {
    const lastDot = baseName.lastIndexOf('.');
    const nameWithoutExt = lastDot > 0 ? baseName.substring(0, lastDot) : baseName;
    const ext = lastDot > 0 ? baseName.substring(lastDot) : '';

    let counter = 1;
    let newName = `${nameWithoutExt} (${counter})${ext}`;

    while (
      await this.fileRepository.existsByNameInFolder(folderId, newName, mimeType, excludeFileId)
    ) {
      counter++;
      newName = `${nameWithoutExt} (${counter})${ext}`;
    }

    return newName;
  }
}
