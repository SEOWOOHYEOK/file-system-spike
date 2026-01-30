import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  StorageType,
  AvailabilityStatus,
  RenameFileRequest,
  RenameFileResponse,
  MoveFileRequest,
  MoveFileResponse,
  DeleteFileResponse,
  MoveConflictStrategy,
  ConflictStrategy,
  FILE_REPOSITORY,
  TransactionOptions,
} from '../../domain/file';
import { FILE_STORAGE_OBJECT_REPOSITORY } from '../../domain/storage';
import {
  FOLDER_REPOSITORY,
} from '../../domain/folder';
import {
  TrashMetadataFactory,
  TRASH_REPOSITORY,
} from '../../domain/trash';
import {
  SyncEventFactory,
  SYNC_EVENT_REPOSITORY,
} from '../../domain/sync-event';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import type { IFileRepository } from '../../domain/file';
import type { IFileStorageObjectRepository } from '../../domain/storage';
import type { IFolderRepository } from '../../domain/folder';
import type { ITrashRepository } from '../../domain/trash';
import type { ISyncEventRepository } from '../../domain/sync-event';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';

/**
 * 파일 관리 비즈니스 서비스
 * 파일명 변경, 파일 이동, 파일 삭제(휴지통) 처리
 */
@Injectable()
export class FileManageService {
  private readonly logger = new Logger(FileManageService.name);

  constructor(
    @Inject(FILE_REPOSITORY)
    private readonly fileRepository: IFileRepository,
    @Inject(FILE_STORAGE_OBJECT_REPOSITORY)
    private readonly fileStorageObjectRepository: IFileStorageObjectRepository,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
    @Inject(TRASH_REPOSITORY)
    private readonly trashRepository: ITrashRepository,
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 파일명 변경
   * 
   * 처리 플로우:
   * 1. 트랜잭션 시작
   * 2. 파일 락 획득
   * 3. NAS 동기화 상태 체크
   * 4. 동일 파일명 존재 확인
   * 5. 파일명 업데이트
   * 6. NAS 경로 + 동기화 상태 업데이트
   * 7. 트랜잭션 커밋
   * 8. Bull 큐 등록 (NAS 동기화)
   */
  async rename(fileId: string, request: RenameFileRequest, userId: string): Promise<RenameFileResponse> {
    const { newName, conflictStrategy = ConflictStrategy.ERROR } = request;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let oldObjectKey: string | null = null;
    let newObjectKey: string | null = null;

    try {
      const txOptions: TransactionOptions = { queryRunner };

      // 1. 파일 조회 (락)
      const file = await this.fileRepository.findByIdForUpdate(fileId, txOptions);
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

      // 2. 요청 검증 (파일명/확장자)
      const sanitizedName = this.validateRenameRequest(file.name, newName);

      // 3. NAS 동기화 상태 체크
      await this.checkNasSyncStatus(fileId, txOptions);

      // 4. 동일 파일명 존재 확인
      const finalName = await this.resolveFileNameForRename(
        file.folderId,
        sanitizedName,
        file.mimeType,
        fileId,
        conflictStrategy,
        txOptions,
        file.createdAt,
      );

      // 5. 파일명 업데이트
      file.rename(finalName);
      await this.fileRepository.save(file, txOptions);

      // 6. NAS 상태 업데이트
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
        txOptions,
      );
      if (nasObject) {
        oldObjectKey = nasObject.objectKey;
        const timestamp = this.extractTimestampFromObjectKey(oldObjectKey) ?? this.formatTimestamp(file.createdAt);
        newObjectKey = `${timestamp}__${finalName}`;
        nasObject.updateObjectKey(newObjectKey);
        nasObject.updateStatus(AvailabilityStatus.SYNCING);
        await this.fileStorageObjectRepository.save(nasObject, txOptions);
      }

      // 7. sync_events 생성 (문서 요구사항)
      const folder = await this.folderRepository.findById(file.folderId);
      const filePath = folder && folder.path !== '/' ? `${folder.path}/${finalName}` : `/${finalName}`;

      const syncEventId = uuidv4();
      const syncEvent = SyncEventFactory.createFileRenameEvent({
        id: syncEventId,
        fileId,
        sourcePath: oldObjectKey || '',
        targetPath: newObjectKey || '',
        oldName: oldObjectKey || '',
        newName: finalName,
      });
      await this.syncEventRepository.save(syncEvent);

      await queryRunner.commitTransaction();
      this.logger.debug(`File renamed: ${fileId} -> ${finalName}`);

      // 8. Bull 큐 등록 (NAS_SYNC_RENAME) - 트랜잭션 커밋 후 실행
      if (oldObjectKey && newObjectKey) {
        await this.jobQueue.addJob('NAS_SYNC_RENAME', {
          fileId,
          syncEventId,
          oldObjectKey,
          newObjectKey,
        });
        this.logger.debug(`NAS_SYNC_RENAME job added for file: ${fileId}`);
      }

      return {
        id: file.id,
        name: file.name,
        path: filePath,
        storageStatus: {
          nas: 'SYNCING',
        },
        updatedAt: file.updatedAt.toISOString(),
        syncEventId,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to rename file: ${fileId}`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 파일 이동
   * 
   * 처리 플로우:
   * 1. 대상 폴더 존재 확인
   * 2. 트랜잭션 시작
   * 3. 파일 락 획득
   * 4. NAS 동기화 상태 체크
   * 5. 동일 파일 존재 확인 + 충돌 처리
   * 6. 파일 이동 (폴더 변경)
   * 7. NAS 경로 + 동기화 상태 업데이트
   * 8. 트랜잭션 커밋
   * 9. Bull 큐 등록 (NAS 동기화)
   */
  async move(fileId: string, request: MoveFileRequest, userId: string): Promise<MoveFileResponse> {
    const { targetFolderId, conflictStrategy = MoveConflictStrategy.ERROR } = request;

    // 1. 대상 폴더 존재 확인 (트랜잭션 밖에서 확인)
    const targetFolder = await this.folderRepository.findById(targetFolderId);
    if (!targetFolder || !targetFolder.isActive()) {
      throw new NotFoundException({
        code: 'TARGET_FOLDER_NOT_FOUND',
        message: '대상 폴더를 찾을 수 없습니다.',
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let sourcePath: string | null = null;
    let targetPath: string | null = null;
    let originalFolderId: string | null = null;

    try {
      const txOptions: TransactionOptions = { queryRunner };

      // 2. 파일 조회 (락)
      const file = await this.fileRepository.findByIdForUpdate(fileId, txOptions);
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

      // 원래 폴더 ID/경로 저장 (원복용)
      originalFolderId = file.folderId;
      const sourceFolder = await this.folderRepository.findById(file.folderId);
      const sourceFolderPath = sourceFolder ? sourceFolder.path : '';

      // 3. NAS 동기화 상태 체크
      await this.checkNasSyncStatus(fileId, txOptions);

      // 4. 충돌 처리
      const { finalName, skipped } = await this.resolveConflictForMove(
        targetFolderId,
        file.name,
        file.mimeType,
        conflictStrategy,
        txOptions,
        file.createdAt,
      );

      if (skipped) {
        await queryRunner.rollbackTransaction();
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
      await this.fileRepository.save(file, txOptions);

      // 6. NAS 상태 업데이트
      const nasObject = await this.fileStorageObjectRepository.findByFileIdAndType(
        fileId,
        StorageType.NAS,
        txOptions,
      );
      if (nasObject) {
        sourcePath = nasObject.objectKey;
        targetPath = nasObject.objectKey; // objectKey는 유지
        nasObject.updateStatus(AvailabilityStatus.SYNCING);
        await this.fileStorageObjectRepository.save(nasObject, txOptions);
      }

      // 7. sync_events 생성 (문서 요구사항)
      const filePath = `${targetFolder.path}/${finalName}`;
      const sourcePathWithFolder = sourceFolderPath ? `${sourceFolderPath}/${targetPath ?? ''}` : targetPath ?? '';
      const targetPathWithFolder = `${targetFolder.path}/${targetPath ?? ''}`;

      const syncEventId = uuidv4();
      const syncEvent = SyncEventFactory.createFileMoveEvent({
        id: syncEventId,
        fileId,
        sourcePath: sourcePathWithFolder,
        targetPath: targetPathWithFolder,
        originalFolderId: originalFolderId || '',
        targetFolderId,
      });
      await this.syncEventRepository.save(syncEvent);

      await queryRunner.commitTransaction();
      this.logger.debug(`File moved: ${fileId} -> folder ${targetFolderId}`);

      // 8. Bull 큐 등록 (NAS_SYNC_MOVE) - 트랜잭션 커밋 후 실행
      if (sourcePath && targetPath && originalFolderId) {
        await this.jobQueue.addJob('NAS_SYNC_MOVE', {
          fileId,
          syncEventId,
          sourcePath,
          targetPath,
          originalFolderId,
          targetFolderId,
        });
        this.logger.debug(`NAS_SYNC_MOVE job added for file: ${fileId}`);
      }

      return {
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        path: filePath,
        storageStatus: {
          nas: 'SYNCING',
        },
        updatedAt: file.updatedAt.toISOString(),
        syncEventId,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to move file: ${fileId}`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 파일 삭제 (휴지통 이동)
   * 
   * 처리 플로우:
   * 1. 트랜잭션 시작
   * 2. 파일 락 획득
   * 3. NAS 동기화 상태 체크
   * 4. 파일 상태 변경 (TRASHED)
   * 5. trash_metadata 생성
   * 6. NAS 상태 업데이트 (MOVING)
   * 7. sync_events 생성 (문서 요구사항)
   * 8. 트랜잭션 커밋
   * 9. Bull 큐 등록 (NAS 휴지통 이동)
   *
   * 문서: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
   * 응답: 200 OK (id, name, state=TRASHED, syncEventId)
   */
  async delete(fileId: string, userId: string): Promise<DeleteFileResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let currentObjectKey: string | null = null;
    let trashPath: string | null = null;

    try {
      const txOptions: TransactionOptions = { queryRunner };

      // 1. 파일 조회 (락)
      const file = await this.fileRepository.findByIdForUpdate(fileId, txOptions);
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
      const nasObject = await this.checkNasSyncStatus(fileId, txOptions);

      // 3. lease_count 체크 (다운로드 중 여부)
      // FLOW 4-1 step 4: 파일 사용 중 여부 확인
      if (nasObject && nasObject.leaseCount > 0) {
        throw new ConflictException({
          code: 'FILE_IN_USE',
          message: '파일을 사용 중인 사용자가 있어 삭제할 수 없습니다.',
        });
      }

      // 4. 원래 경로 저장
      const folder = await this.folderRepository.findById(file.folderId);
      const originalPath = folder && folder.path !== '/' ? `${folder.path}/${file.name}` : `/${file.name}`;

      // 5. 파일 상태 변경
      file.delete();
      await this.fileRepository.save(file, txOptions);

      // 6. trash_metadata 생성
      const trashMetadata = TrashMetadataFactory.createForFile({
        id: uuidv4(),
        fileId: file.id,
        originalPath,
        originalFolderId: file.folderId,
        deletedBy: userId,
      });
      await this.trashRepository.save(trashMetadata);

      // 7. NAS 상태 업데이트 (nasObject는 checkNasSyncStatus에서 이미 조회됨)
      if (nasObject) {
        currentObjectKey = nasObject.objectKey;
          // 휴지통 경로: .trash/{fileId}_{fileName}
          trashPath = `.trash/${file.createdAt.getTime()}_${file.name}`; // 1769417075898_222.txt
        nasObject.updateStatus(AvailabilityStatus.SYNCING);
        await this.fileStorageObjectRepository.save(nasObject, txOptions);
      }

      // 7. sync_events 생성 (문서 요구사항)
      const syncEventId = uuidv4();
      const syncEvent = SyncEventFactory.createFileTrashEvent({
        id: syncEventId,
        fileId,
        sourcePath: originalPath,
        targetPath: trashPath || '',
        originalPath,
        originalFolderId: file.folderId,
      });
      await this.syncEventRepository.save(syncEvent);

      await queryRunner.commitTransaction();
      this.logger.debug(`File deleted (moved to trash): ${fileId}`);

      // 8. Bull 큐 등록 (NAS_MOVE_TO_TRASH) - 트랜잭션 커밋 후 실행
      if (currentObjectKey && trashPath) {
        await this.jobQueue.addJob('NAS_MOVE_TO_TRASH', {
          fileId,
          syncEventId,
          currentObjectKey,
          trashPath,
        });
        this.logger.debug(`NAS_MOVE_TO_TRASH job added for file: ${fileId}`);
      }

      return {
        id: file.id,
        name: file.name,
        state: file.state,
        trashedAt: file.updatedAt.toISOString(),
        syncEventId,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to delete file: ${fileId}`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * NAS 동기화 상태 체크
   * @returns NAS storage object (lease_count 체크 등에 사용)
   */
  private async checkNasSyncStatus(fileId: string, txOptions?: TransactionOptions) {
    const nasObject = await this.fileStorageObjectRepository.findByFileIdAndTypeForUpdate(
      fileId,
      StorageType.NAS,
      txOptions,
    );

    if (nasObject && nasObject.isSyncing()) {
      throw new ConflictException({
        code: 'FILE_SYNCING',
        message: '파일이 동기화 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }

    return nasObject;
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
    txOptions?: TransactionOptions,
    createdAt?: Date,
  ): Promise<string> {
    const exists = await this.fileRepository.existsByNameInFolder(
      folderId,
      newName,
      mimeType,
      excludeFileId,
      txOptions,
      createdAt,
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
    return this.generateUniqueFileName(folderId, newName, mimeType, excludeFileId, txOptions, createdAt);
  }

  /**
   * 파일 이동 시 충돌 해결
   */
  private async resolveConflictForMove(
    targetFolderId: string,
    fileName: string,
    mimeType: string,
    conflictStrategy: MoveConflictStrategy,
    txOptions?: TransactionOptions,
    createdAt?: Date,
  ): Promise<{ finalName: string; skipped: boolean }> {
    const exists = await this.fileRepository.existsByNameInFolder(
      targetFolderId,
      fileName,
      mimeType,
      undefined,
      txOptions,
      createdAt,
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
          undefined,
          txOptions,
          createdAt,
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
    txOptions?: TransactionOptions,
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
        excludeFileId,
        txOptions,
        createdAt,
      )
    ) {
      counter++;
      newName = `${nameWithoutExt} (${counter})${ext}`;
    }

    return newName;
  }

  /**
   * rename 요청 검증
   * - 빈 이름 금지
   * - 확장자 변경 금지
   */
  private validateRenameRequest(originalName: string, newName?: string): string {
    const trimmed = newName?.trim() ?? '';
    if (!trimmed) {
      throw new BadRequestException({
        code: 'INVALID_FILE_NAME',
        message: '파일명은 비어있을 수 없습니다.',
      });
    }

    const originalExt = this.getFileExtension(originalName);
    const newExt = this.getFileExtension(trimmed);
    if (originalExt.toLowerCase() !== newExt.toLowerCase()) {
      throw new BadRequestException({
        code: 'FILE_EXTENSION_CHANGE_NOT_ALLOWED',
        message: '파일 확장자는 변경할 수 없습니다.',
      });
    }

    return trimmed;
  }

  /**
   * 파일 확장자 추출 (없으면 빈 문자열)
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === fileName.length - 1) {
      return '';
    }
    return fileName.substring(lastDot + 1);
  }

  /**
   * NAS objectKey에서 timestamp 추출
   * 형식: YYYYMMDDHHmmss__파일명
   */
  private extractTimestampFromObjectKey(objectKey: string | null): string | null {
    if (!objectKey) {
      return null;
    }
    const [timestamp] = objectKey.split('__');
    return timestamp && timestamp.length === 14 ? timestamp : null;
  }

  /**
   * UTC 기준 타임스탬프 생성 (YYYYMMDDHHmmss)
   */
  private formatTimestamp(createdAt: Date): string {
    const y = createdAt.getUTCFullYear().toString().padStart(4, '0');
    const m = (createdAt.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = createdAt.getUTCDate().toString().padStart(2, '0');
    const hh = createdAt.getUTCHours().toString().padStart(2, '0');
    const mm = createdAt.getUTCMinutes().toString().padStart(2, '0');
    const ss = createdAt.getUTCSeconds().toString().padStart(2, '0');
    return `${y}${m}${d}${hh}${mm}${ss}`;
  }
}
