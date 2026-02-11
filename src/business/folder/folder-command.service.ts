import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { buildPath } from '../../common/utils';
import { RequestContext } from '../../common/context/request-context';
import {
  FolderEntity,
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
  FolderDomainService,
} from '../../domain/folder';
import type { TransactionOptions } from '../../domain/folder/repositories/folder.repository.interface';
import { SyncEventFactory } from '../../domain/sync-event';
import { SyncEventDomainService } from '../../domain/sync-event/service/sync-event-domain.service';
import { TrashDomainService } from '../../domain/trash/service/trash-domain.service';
import { FolderNasStorageObjectDomainService } from '../../domain/storage/folder/service/folder-nas-storage-object-domain.service';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import { NAS_FOLDER_SYNC_QUEUE_PREFIX } from '../worker/nas-folder-sync.worker';

import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';

import {
  type NasFolderMkdirJobData,
  type NasFolderRenameJobData,
  type NasFolderMoveJobData,
  type NasFolderTrashJobData,
  type NasFolderRestoreJobData,
  type NasFolderPurgeJobData,
} from '../worker/nas-folder-sync.worker';

import { CreateFolderParams } from '../../domain/folder/service/folder-domain.service';


/**
 * 폴더 명령 비즈니스 서비스
 * 폴더 생성, 이름 변경, 이동, 삭제 처리
 */
@Injectable()
export class FolderCommandService implements OnModuleInit {
  private readonly logger = new Logger(FolderCommandService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly folderDomainService: FolderDomainService,
    private readonly folderStorageService: FolderNasStorageObjectDomainService,
    private readonly trashDomainService: TrashDomainService,
    private readonly syncEventDomainService: SyncEventDomainService,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: IJobQueuePort,
  ) { }

  async onModuleInit() {
    await this.ensureRootFolderExists();
  }

  /**
   * 루트 폴더 존재 확인 및 생성
   */
  private async ensureRootFolderExists(): Promise<void> {
    try {

      const rootFolder = await this.folderDomainService.루트폴더조회();

      if (!rootFolder) {
        this.logger.log('루트 폴더 없음. 루트 폴더 생성...');

        const folderId = uuidv4();
        const createdBy = 'system';

        // FolderDomainService를 통해 루트 폴더 생성
        await this.folderDomainService.생성<CreateFolderParams>({
          id: folderId,
          name: '',
          parentId: null,
          path: '/',
          createdBy: createdBy, // 루트 폴더는 시스템이 생성
        });

        // FolderNasStorageObjectDomainService를 통해 스토리지 객체 생성
        await this.folderStorageService.생성({
          id: uuidv4(),
          folderId,
          objectKey: '/',
          availabilityStatus: FolderAvailabilityStatus.AVAILABLE, // 루트는 이미 존재한다고 가정
        });

        this.logger.log(`루트 폴더 생성됨 ID: ${folderId}`);
      } else {
        this.logger.log(`루트 폴더 이미 존재함 ID: ${rootFolder.id}`);
      }
    } catch (error) {
      this.logger.error('루트 폴더 생성/확인 실패', error);
    }
  }

  /**
   * 폴더 생성
   */
  async 생성(request: CreateFolderRequest): Promise<CreateFolderResponse> {
    const { name, parentId, conflictStrategy = FolderConflictStrategy.ERROR } = request;

    // 1. 폴더명 유효성 검사
    this.validateFolderName(name);

    // 2. 상위 폴더 존재 확인
    let parentPath = '';
    if (parentId) {
      const parent = await this.folderDomainService.조회(parentId);
      if (!parent || !parent.isActive()) {
        throw BusinessException.of(ErrorCodes.FOLDER_PARENT_NOT_FOUND, { parentId });
      }
      parentPath = parent.path;
    }

    // 3. 동일 이름 폴더 존재 확인
    const finalName = await this.resolveFolderName(parentId, name, conflictStrategy);

    // 4. 폴더 생성
    const folderId = uuidv4();
    const folderPath = buildPath(parentPath, finalName);
    const createdBy = RequestContext.getUserId() || 'unknown';

    const folder = await this.folderDomainService.생성({
      id: folderId,
      name: finalName,
      parentId,
      path: folderPath,
      createdBy,
    });

    // 5. NAS 스토리지 객체 생성
    await this.folderStorageService.생성({
      id: uuidv4(),
      folderId,
      objectKey: folderPath,
      availabilityStatus: FolderAvailabilityStatus.SYNCING,
    });

    // 6. sync_events 생성
    const syncEventId = uuidv4();
    const syncEvent = SyncEventFactory.createFolderCreateEvent({
      id: syncEventId,
      folderId,
      targetPath: folderPath,
      folderName: finalName,
      parentId,
      userId: createdBy,
    });

    await this.syncEventDomainService.저장(syncEvent);

    // 7. Bull 큐 등록 (NAS_FOLDER_SYNC - mkdir)
    await this.jobQueue.addJob<NasFolderMkdirJobData>(NAS_FOLDER_SYNC_QUEUE_PREFIX, {
      folderId,
      action: 'mkdir',
      path: folderPath,
      syncEventId,
    });


    this.logger.debug(`NAS_FOLDER_SYNC (mkdir) 작업 등록됨: 폴더 ${folderId}`);

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
  async 이름변경(folderId: string, request: RenameFolderRequest): Promise<RenameFolderResponse> {
    const { newName, conflictStrategy = FolderConflictStrategy.ERROR } = request;

    // 1. 폴더명 유효성 검사
    this.validateFolderName(newName);

    // QueryRunner 트랜잭션 시작
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const txOptions: TransactionOptions = { queryRunner };

      // 2. 폴더 조회 (락)
      const folder = await this.folderDomainService.잠금조회(folderId, txOptions);
      if (!folder) {
        throw BusinessException.of(ErrorCodes.FOLDER_NOT_FOUND, { folderId });
      }

      if (!folder.isActive()) {
        throw BusinessException.of(ErrorCodes.FOLDER_NOT_ACTIVE, {
          folderId,
          message: '활성 상태의 폴더만 이름을 변경할 수 있습니다.',
        });
      }

      // 3. NAS 동기화 상태 체크
      await this.checkNasSyncStatus(folderId, txOptions);

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
      await this.folderDomainService.저장(folder, txOptions);

      // 7. 하위 폴더 경로 일괄 업데이트
      await this.folderDomainService.경로일괄변경(oldPath, newPath, txOptions);

      // 8. NAS 스토리지 상태 업데이트
      const storageObject = await this.folderStorageService.조회(folderId, txOptions);
      if (storageObject) {
        storageObject.updateStatus(FolderAvailabilityStatus.SYNCING);
        storageObject.updateObjectKey(newPath);
        await this.folderStorageService.저장(storageObject, txOptions);
      }



      // 9. sync_events 생성
      const syncEventId = uuidv4();
      const userId = RequestContext.getUserId() || 'unknown';
      const syncEvent = SyncEventFactory.createFolderRenameEvent({
        id: syncEventId,
        folderId,
        sourcePath: oldPath,
        targetPath: newPath,
        oldName: folder.name,
        newName: finalName,
        oldPath,
        newPath,
        userId,
      });
      await this.syncEventDomainService.저장(syncEvent);

      // 트랜잭션 커밋
      await queryRunner.commitTransaction();

      // 10. Bull 큐 등록 (NAS_FOLDER_SYNC - rename) - 커밋 후 등록
      await this.jobQueue.addJob<NasFolderRenameJobData>(NAS_FOLDER_SYNC_QUEUE_PREFIX, {
        folderId,
        action: 'rename',
        oldPath,
        newPath,
        syncEventId,
      });

      // 11. 큐 등록 성공 시 QUEUED로 변경
      syncEvent.markQueued();
      await this.syncEventDomainService.저장(syncEvent);

      this.logger.debug(`NAS_FOLDER_SYNC (rename) 작업 등록됨: 폴더 ${folderId}`);

      return {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        storageStatus: {
          nas: 'SYNCING',
        },
        updatedAt: folder.updatedAt.toISOString(),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 폴더 이동
   */
  async 이동(folderId: string, request: MoveFolderRequest): Promise<MoveFolderResponse> {
    const { targetParentId, conflictStrategy = MoveFolderConflictStrategy.ERROR } = request;

    // 1. 대상 상위 폴더 존재 확인
    const targetParent = await this.folderDomainService.조회(targetParentId);
    if (!targetParent || !targetParent.isActive()) {
      throw BusinessException.of(ErrorCodes.FOLDER_TARGET_NOT_FOUND, { targetParentId });
    }

    // QueryRunner 트랜잭션 시작
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const txOptions: TransactionOptions = { queryRunner };

      // 2. 폴더 조회 (락)
      const folder = await this.folderDomainService.잠금조회(folderId, txOptions);
      if (!folder) {
        throw BusinessException.of(ErrorCodes.FOLDER_NOT_FOUND, { folderId });
      }

      if (!folder.isActive()) {
        throw BusinessException.of(ErrorCodes.FOLDER_NOT_ACTIVE, {
          folderId,
          message: '활성 상태의 폴더만 이동할 수 있습니다.',
        });
      }

      // 원래 부모 폴더 ID 저장 (원복용)
      const originalParentId = folder.parentId;

      // 3. 순환 이동 방지 체크
      if (targetParent.path.startsWith(folder.path + '/') || targetParent.id === folder.id) {
        throw BusinessException.of(ErrorCodes.FOLDER_CIRCULAR_MOVE, { folderId, targetParentId });
      }

      // 4. NAS 동기화 상태 체크
      await this.checkNasSyncStatus(folderId, txOptions);

      // 5. 충돌 처리
      const { finalName, skipped } = await this.resolveConflictForMove(
        targetParentId,
        folder.name,
        conflictStrategy,
      );

      if (skipped) {
        await queryRunner.rollbackTransaction();
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
      const newPath = buildPath(targetParent.path, finalName);

      // 7. 폴더 이동
      folder.moveTo(targetParentId, newPath);
      if (finalName !== folder.name) {
        folder.rename(finalName, newPath);
      }
      await this.folderDomainService.저장(folder, txOptions);

      // 8. 하위 폴더 경로 일괄 업데이트
      await this.folderDomainService.경로일괄변경(oldPath, newPath, txOptions);

      // 9. NAS 상태 업데이트
      const storageObject = await this.folderStorageService.조회(folderId, txOptions);
      if (storageObject) {
        storageObject.updateStatus(FolderAvailabilityStatus.SYNCING);
        storageObject.updateObjectKey(newPath);
        await this.folderStorageService.저장(storageObject, txOptions);
      }

      // 10. sync_events 생성
      const syncEventId = uuidv4();
      const userId = RequestContext.getUserId() || 'unknown';
      const syncEvent = SyncEventFactory.createFolderMoveEvent({
        id: syncEventId,
        folderId,
        sourcePath: oldPath,
        targetPath: newPath,
        originalParentId,
        targetParentId,
        oldPath,
        newPath,
        userId,
      });
      await this.syncEventDomainService.저장(syncEvent);

      // 트랜잭션 커밋
      await queryRunner.commitTransaction();

      // 11. Bull 큐 등록 (NAS_FOLDER_SYNC - move) - 커밋 후 등록
      await this.jobQueue.addJob<NasFolderMoveJobData>(NAS_FOLDER_SYNC_QUEUE_PREFIX, {
        folderId,
        action: 'move',
        oldPath,
        newPath,
        originalParentId,
        targetParentId,
        syncEventId,
      });

      this.logger.debug(`NAS_FOLDER_SYNC (move) 작업 등록됨: 폴더 ${folderId}`);

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
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
    // QueryRunner 트랜잭션 시작
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const txOptions: TransactionOptions = { queryRunner };

      // 1. 폴더 조회 (락)
      const folder = await this.folderDomainService.잠금조회(folderId, txOptions);
      if (!folder) {
        throw BusinessException.of(ErrorCodes.FOLDER_NOT_FOUND, { folderId });
      }

      if (folder.isTrashed()) {
        throw BusinessException.of(ErrorCodes.FOLDER_ALREADY_TRASHED, { folderId });
      }

      if (!folder.isActive()) {
        throw BusinessException.of(ErrorCodes.FOLDER_NOT_ACTIVE, {
          folderId,
          message: '활성 상태의 폴더만 삭제할 수 있습니다.',
        });
      }

      // 2. 빈 폴더 체크 (정책: 빈 폴더만 삭제 가능)
      // FLOW 4-1 step 3: check child contents (folders + files)
      const statistics = await this.folderDomainService.통계조회(folderId);
      const childFolderCount = statistics.folderCount;
      const childFileCount = statistics.fileCount;

      if (childFolderCount > 0 || childFileCount > 0) {
        throw BusinessException.of(
          ErrorCodes.FOLDER_NOT_EMPTY,
          { folderId, childFolderCount, childFileCount },
          `폴더가 비어있지 않아 삭제할 수 없습니다. (하위 폴더: ${childFolderCount}개, 파일: ${childFileCount}개)`,
        );
      }

      // 3. NAS 동기화 상태 체크
      await this.checkNasSyncStatus(folderId, txOptions);

      // 3. 현재 경로 저장
      const currentPath = folder.path;

      // 4. 폴더 상태 변경 (TRASHED)
      folder.delete();
      await this.folderDomainService.저장(folder, txOptions);

      // 5. trashMetadataId 먼저 생성 후 trash_metadata 생성 (최상위 폴더만)
      const trashMetadataId = uuidv4();
      await this.trashDomainService.폴더메타생성({
        id: trashMetadataId,
        folderId: folder.id,
        originalPath: folder.path,
        originalParentId: folder.parentId,
        deletedBy: userId,
      });

      // 6. NAS 상태 업데이트
      const storageObject = await this.folderStorageService.조회(folderId, txOptions);
      // 휴지통 경로: .trash/{trashMetadataId}__{folderName} (통일된 형식)
      const trashPath = `.trash/${trashMetadataId}__${folder.name}`;
      if (storageObject) {
        storageObject.updateStatus(FolderAvailabilityStatus.SYNCING);
        await this.folderStorageService.저장(storageObject, txOptions);
      }

      // 7. sync_events 생성
      const syncEventId = uuidv4();
      const syncEvent = SyncEventFactory.createFolderTrashEvent({
        id: syncEventId,
        folderId,
        sourcePath: currentPath,
        targetPath: trashPath,
        originalPath: currentPath,
        originalParentId: folder.parentId,
        currentPath,
        trashPath,
        userId,
      });

      await this.syncEventDomainService.저장(syncEvent);

      // 트랜잭션 커밋
      await queryRunner.commitTransaction();

      // 8. Bull 큐 등록 (NAS_FOLDER_SYNC - trash) - 커밋 후 등록
      await this.jobQueue.addJob<NasFolderTrashJobData>(NAS_FOLDER_SYNC_QUEUE_PREFIX, {
        folderId,
        action: 'trash',
        currentPath,
        trashPath,
        syncEventId,
      });
      this.logger.debug(`NAS_FOLDER_SYNC (trash) 작업 등록됨: 폴더 ${folderId}`);

      return {
        id: folder.id,
        name: folder.name,
        state: folder.state,
        trashedAt: folder.updatedAt.toISOString(),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 폴더명 유효성 검사
   */
  private validateFolderName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw BusinessException.of(
        ErrorCodes.FOLDER_INVALID_NAME,
        { name },
        '폴더명은 비워둘 수 없습니다.',
      );
    }

    // 특수문자 검사
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) {
      throw BusinessException.of(
        ErrorCodes.FOLDER_INVALID_NAME,
        { name },
        '폴더명에 사용할 수 없는 문자가 포함되어 있습니다.',
      );
    }

    // 길이 검사
    if (name.length > 255) {
      throw BusinessException.of(
        ErrorCodes.FOLDER_INVALID_NAME,
        { name, length: name.length },
        '폴더명은 255자를 초과할 수 없습니다.',
      );
    }
  }

  /**
   * NAS 동기화 상태 체크
   */
  private async checkNasSyncStatus(folderId: string, options?: TransactionOptions): Promise<void> {
    // 상태 체크만 하므로 lock 불필요 - 조회 사용
    const storageObject = await this.folderStorageService.조회(folderId, options);

    if (storageObject && storageObject.isSyncing()) {
      throw BusinessException.of(ErrorCodes.FOLDER_SYNCING, { folderId });
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
    const exists = await this.folderDomainService.중복확인(parentId, name);

    if (!exists) {
      return name;
    }

    if (conflictStrategy === FolderConflictStrategy.ERROR) {
      throw BusinessException.of(ErrorCodes.FOLDER_DUPLICATE_EXISTS, { parentId, name });
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
    const exists = await this.folderDomainService.중복확인(parentId, name, excludeFolderId);

    if (!exists) {
      return name;
    }

    if (conflictStrategy === FolderConflictStrategy.ERROR) {
      throw BusinessException.of(ErrorCodes.FOLDER_DUPLICATE_EXISTS, { parentId, name });
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
    const exists = await this.folderDomainService.중복확인(targetParentId, folderName);

    if (!exists) {
      return { finalName: folderName, skipped: false };
    }

    switch (conflictStrategy) {
      case MoveFolderConflictStrategy.ERROR:
        throw BusinessException.of(ErrorCodes.FOLDER_DUPLICATE_EXISTS, {
          targetParentId,
          folderName,
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

    while (await this.folderDomainService.중복확인(parentId, newName, excludeFolderId)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }

    return newName;
  }
}
