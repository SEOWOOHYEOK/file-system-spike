import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { createPaginationInfo } from '../../common/types/pagination';
import {
  TrashListResponse,
  TrashItem,
  TrashListQuery,
  RestorePreviewRequest,
  RestorePreviewResponse,
  RestoreExecuteRequest,
  RestoreExecuteResponse,
  RestoreStatusResponse,
  EmptyTrashResponse,
  PurgeResponse,
  RestorePathStatus,
  TRASH_REPOSITORY,
  TRASH_QUERY_SERVICE,
} from '../../domain/trash';
import type { ITrashRepository, ITrashQueryService } from '../../domain/trash';
import {
  FILE_REPOSITORY,
} from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import type { IFileRepository } from '../../domain/file';
import {
  FolderState,
  FOLDER_REPOSITORY,
} from '../../domain/folder';
import type { IFolderRepository } from '../../domain/folder';
import {
  FILE_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage';

import {
  FOLDER_STORAGE_OBJECT_REPOSITORY,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';

import {
  type IFolderStorageObjectRepository,
} from '../../domain/storage/folder/repositories/folder-storage-object.repository.interface';

import type { IFileStorageObjectRepository } from '../../domain/storage';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import type { IJobQueuePort } from '../../domain/queue/ports/job-queue.port';
import { NAS_FILE_SYNC_QUEUE_PREFIX, NasFileSyncJobData } from '../worker/nas-file-sync.worker';
import {
  SYNC_EVENT_REPOSITORY,
  SyncEventStatus,
} from '../../domain/sync-event';
import type { ISyncEventRepository } from '../../domain/sync-event';

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
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueuePort: IJobQueuePort,
    @Inject(SYNC_EVENT_REPOSITORY)
    private readonly syncEventRepository: ISyncEventRepository,
  ) { }

  /**
   * 휴지통 목록 조회
   */
  async getTrashList(query: TrashListQuery): Promise<TrashListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const result = await this.trashQueryService.getTrashList({
      sortBy: query.sortBy,
      order: query.order,
      page,
      limit,
    });

    const items: TrashItem[] = [];

    for (const item of result.items) {
      // 경로 상태 확인 (Preview 로직과 유사하지만 간소화)
      // originalPath는 파일 전체 경로이므로 부모 폴더 경로 추출
      const parentFolderPath = this.extractParentFolderPath(item.originalPath);
      const targetFolder = await this.folderRepository.findOne({
        path: parentFolderPath,
        state: FolderState.ACTIVE,
      });

      const pathStatus = targetFolder ? RestorePathStatus.AVAILABLE : RestorePathStatus.NOT_FOUND;
      const resolveFolderId = targetFolder ? targetFolder.id : null;

      items.push({
        type: 'FILE',
        id: item.id,
        name: item.name,
        sizeBytes: item.sizeBytes || 0,
        mimeType: item.mimeType || '',
        extension: item.name.split('.').pop() || '',
        trashMetadataId: item.trashMetadataId,
        originalPath: item.originalPath,
        originalFolderId: '', // TODO: QueryService에서 가져오도록 수정 필요
        originalFolderName: '', // TODO: QueryService에서 가져오도록 수정 필요
        deletedAt: item.deletedAt,
        deletedBy: item.deletedBy,
        deletedByName: '', // TODO: User Service 연동 필요
        expiresAt: item.expiresAt,
        daysUntilExpiry: Math.ceil((new Date(item.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
        createdAt: new Date(), // TODO: QueryService에서 가져오도록 수정 필요
        restoreInfo: {
          pathStatus,
          resolveFolderId,
        },
      });
    }

    const paginationInfo = createPaginationInfo(page, limit, result.totalCount);

    return {
      items,
      totalCount: result.totalCount,
      totalSizeBytes: result.totalSizeBytes,
      pagination: {
        page: paginationInfo.page,
        limit: paginationInfo.pageSize,
        totalPages: paginationInfo.totalPages,
        hasNext: paginationInfo.hasNext,
        hasPrev: paginationInfo.hasPrev,
      },
      appliedFilters: {
        search: query.search,
        mimeType: query.mimeType,
        mimeCategory: query.mimeCategory,
        deletedBy: query.deletedBy,
      },
    };
  }

  /**
   * 복원 미리보기 (경로 상태 확인)
   */
  async previewRestore(request: RestorePreviewRequest): Promise<RestorePreviewResponse> {
    const items: RestorePreviewResponse['items'] = [];
    const summary = { available: 0, notFound: 0, conflict: 0 };


    const trashMetadataIds = request.trashMetadataIds || [];

    for (const id of trashMetadataIds) {
      const trashMetadata = await this.trashRepository.findById(id);
      if (!trashMetadata || !trashMetadata.isFile()) {
        continue;
      }

      const file = await this.fileRepository.findById(trashMetadata.fileId!);
      if (!file) {
        continue;
      }

      // 1. 경로명으로 폴더 존재 여부 확인
      // originalPath는 파일의 전체 경로 (예: "/projects/2024/report.pdf")
      // 부모 폴더 경로를 추출해야 함 (예: "/projects/2024/")
      const originalPath = trashMetadata.originalPath;
      const parentFolderPath = this.extractParentFolderPath(originalPath);

      const targetFolder = await this.folderRepository.findOne({
        path: parentFolderPath,
        state: FolderState.ACTIVE,
      });

      let pathStatus = RestorePathStatus.NOT_FOUND;
      let resolveFolderId: string | null = null;
      let hasConflict = false;
      let conflictFileId: string | undefined;

      if (targetFolder) {
        pathStatus = RestorePathStatus.AVAILABLE;
        resolveFolderId = targetFolder.id;

        // 2. 충돌 확인 (파일명 + MIME타입 + 생성시간)
        hasConflict = await this.fileRepository.existsByNameInFolder(
          targetFolder.id,
          file.name,
          file.mimeType,
          undefined, // excludeFileId
          undefined, // options
          file.createdAt, // createdAt 체크
        );

        if (hasConflict) {
          // 충돌 파일 ID 조회 (optional)
          const conflictFile = await this.fileRepository.findOne({
            folderId: targetFolder.id,
            name: file.name,
            mimeType: file.mimeType,
            state: FileState.ACTIVE,
          });
          if (conflictFile) {
            conflictFileId = conflictFile.id;
          }
        }
      }

      // 요약 집계
      if (pathStatus === RestorePathStatus.AVAILABLE) {
        summary.available++;
        if (hasConflict) {
          summary.conflict++;
        }
      } else {
        summary.notFound++;
      }

      items.push({
        trashMetadataId: id,
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        deletedAt: trashMetadata.deletedAt,
        pathStatus,
        originalPath,
        originalFolderId: trashMetadata.originalFolderId!,
        resolveFolderId,
        hasConflict,
        conflictFileId,
      });
    }

    return {
      totalCount: items.length,
      items,
      summary,
    };
  }

  /**
   * 복원 실행
   */
  async executeRestore(request: RestoreExecuteRequest, userId: string): Promise<RestoreExecuteResponse> {
    let queued = 0;
    let excluded = 0;
    let skipped = 0;
    const syncEventIds: string[] = [];
    const skippedItems: RestoreExecuteResponse['skippedItems'] = [];

    for (const item of request.items) {
      // 1. 제외 항목 처리
      if (item.exclude) {
        excluded++;
        continue;
      }

      // 2. 휴지통 메타데이터 조회
      const trashMetadata = await this.trashRepository.findById(item.trashMetadataId);
      if (!trashMetadata || !trashMetadata.isFile()) {
        continue;
      }

      // 3. 파일 조회
      const file = await this.fileRepository.findById(trashMetadata.fileId!);
      if (!file || !file.isTrashed()) {
        continue;
      }

      // 4. 복구 대상 폴더 결정
      let targetFolderId: string | null = null;

      if (item.targetFolderId) {
        // 사용자가 지정한 폴더
        const targetFolder = await this.folderRepository.findById(item.targetFolderId);
        if (targetFolder) {
          targetFolderId = targetFolder.id;
        }
      } else {
        // 경로명으로 자동 찾기 (부모 폴더 경로 추출)
        const parentFolderPath = this.extractParentFolderPath(trashMetadata.originalPath);
        const resolvedFolder = await this.folderRepository.findOne({
          path: parentFolderPath,
          state: FolderState.ACTIVE,
        });

        
        if (resolvedFolder) {
          targetFolderId = resolvedFolder.id;
        }
      }

      // 5. 경로 없으면 skip
      if (!targetFolderId) {
        skipped++;
        skippedItems.push({
          trashMetadataId: item.trashMetadataId,
          fileName: file.name,
          reason: 'PATH_NOT_FOUND',
        });
        continue;
      }

      // 6. 충돌 확인
      const hasConflict = await this.fileRepository.existsByNameInFolder(
        targetFolderId,
        file.name,
        file.mimeType,
        undefined,
        undefined,
        file.createdAt,
      );

      if (hasConflict) {
        skipped++;
        skippedItems.push({
          trashMetadataId: item.trashMetadataId,
          fileName: file.name,
          reason: 'CONFLICT',
        });
        continue;
      }

      // 7. 큐에 복원 작업 추가
      const syncEventId = uuidv4();
      const jobData: NasFileSyncJobData = {
        fileId: file.id,
        action: 'restore',
        syncEventId,
        trashMetadataId: item.trashMetadataId,
        restoreTargetFolderId: targetFolderId,
        userId,
      };
      await this.jobQueuePort.addJob(NAS_FILE_SYNC_QUEUE_PREFIX, jobData);

      syncEventIds.push(syncEventId);
      queued++;
    }

    return {
      message: queued > 0 ? '복구 작업이 시작되었습니다.' : '복구할 항목이 없습니다.',
      queued,
      excluded,
      skipped,
      syncEventIds,
      skippedItems,
    };
  }

  /**
   * 복원 상태 조회
   */
  async getRestoreStatus(syncEventIds: string[]): Promise<RestoreStatusResponse> {
    if (syncEventIds.length === 0) {
      return {
        summary: { total: 0, pending: 0, processing: 0, done: 0, failed: 0 },
        isCompleted: true,
        items: [],
      };
    }

    const syncEvents = await this.syncEventRepository.findByIds(syncEventIds);

    const summary = {
      total: syncEvents.length,
      pending: 0,
      processing: 0,
      done: 0,
      failed: 0,
    };

    const items: RestoreStatusResponse['items'] = [];

    for (const event of syncEvents) {
      // 상태별 집계
      switch (event.status) {
        case SyncEventStatus.PENDING:
          summary.pending++;
          break;
        case SyncEventStatus.PROCESSING:
          summary.processing++;
          break;
        case SyncEventStatus.DONE:
          summary.done++;
          break;
        case SyncEventStatus.FAILED:
          summary.failed++;
          break;
      }

      // 개별 항목 상태
      items.push({
        syncEventId: event.id,
        fileId: event.fileId || '',
        fileName: event.metadata?.fileName || '',
        status: event.status as 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED',
        errorMessage: event.errorMessage,
        createdAt: event.createdAt,
        processedAt: event.processedAt,
      });
    }

    // 전체 완료 여부 (pending=0 && processing=0)
    const isCompleted = summary.pending === 0 && summary.processing === 0;

    return {
      summary,
      isCompleted,
      items,
    };
  }

  /**
   * 파일 영구삭제
   */
  async purgeFile(trashMetadataId: string, userId: string): Promise<PurgeResponse> {
    // 1. 휴지통 메타데이터 조회
    const trashMetadata = await this.trashRepository.findById(trashMetadataId);
    if (!trashMetadata || !trashMetadata.isFile()) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    // 2. 파일 조회
    const file = await this.fileRepository.findById(trashMetadata.fileId!);
    if (!file || !file.isTrashed()) {
      throw new BadRequestException({
        code: 'FILE_NOT_IN_TRASH',
        message: '휴지통에 있는 파일만 영구 삭제할 수 있습니다.',
      });
    }

    // 3. 파일 상태를 DELETED로 변경
    file.permanentDelete();
    await this.fileRepository.save(file);

    // 4. 큐에 영구삭제 작업 추가 (캐시/NAS 스토리지 삭제)
    const syncEventId = uuidv4();
    const jobData: NasFileSyncJobData = {
      fileId: file.id,
      action: 'purge',
      syncEventId,
      trashMetadataId,
      userId,
    };
    await this.jobQueuePort.addJob(NAS_FILE_SYNC_QUEUE_PREFIX, jobData);

    return {
      id: file.id,
      name: file.name,
      type: 'FILE',
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
          success++;
        }
        // 폴더는 휴지통에 가지 않으므로 파일만 처리
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
   * 파일의 전체 경로에서 부모 폴더 경로 추출
   * 예: "/projects/2024/report.pdf" → "/projects/2024"
   * 예: "/333.txt" → "/"
   */
  private extractParentFolderPath(filePath: string): string {
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex <= 0) {
      // 루트 폴더의 파일인 경우 (예: "/333.txt")
      return '/';
    }
    // 부모 폴더 경로 반환 (마지막 슬래시 미포함)
    const parentPath = filePath.substring(0, lastSlashIndex);
    return parentPath === '' ? '/' : parentPath;
  }
}
