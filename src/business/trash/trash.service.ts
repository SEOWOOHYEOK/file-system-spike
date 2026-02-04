import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { createPaginationInfo } from '../../common/types/pagination';
import { RequestContext } from '../../common/context/request-context';
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
  TrashDomainService,
} from '../../domain/trash';
import { FileState } from '../../domain/file/type/file.type';
import {
  FolderState,
  FolderDomainService,
} from '../../domain/folder';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { JOB_QUEUE_PORT } from '../../infra/queue/job-queue.port';
import type { IJobQueuePort } from '../../infra/queue/job-queue.port';
import {
  NAS_FILE_SYNC_QUEUE_PREFIX,
  NasFileRestoreJobData,
  NasFilePurgeJobData,
} from '../worker/nas-file-sync.worker';
import {
  NAS_FOLDER_SYNC_QUEUE_PREFIX,
  NasFolderRestoreJobData,
  NasFolderPurgeJobData,
} from '../worker/nas-folder-sync.worker';
import {
  SyncEventStatus,
  SyncEventDomainService,
  SyncEventFactory,
} from '../../domain/sync-event';

/**
 * 휴지통 비즈니스 서비스
 * 휴지통 목록 조회, 복원, 영구삭제, 휴지통 비우기
 * 
 * DDD 규칙: Business Layer는 Repository를 직접 주입받지 않고
 * Domain Service를 통해 도메인 로직을 실행합니다.
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly trashDomainService: TrashDomainService,
    private readonly fileDomainService: FileDomainService,
    private readonly folderDomainService: FolderDomainService,
    private readonly syncEventDomainService: SyncEventDomainService,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueuePort: IJobQueuePort,
  ) { }

  /**
   * 휴지통 목록 조회
   */
  async getTrashList(query: TrashListQuery): Promise<TrashListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const result = await this.trashDomainService.상세목록조회({
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
      const targetFolder = await this.folderDomainService.조건조회({
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
   * 파일과 폴더 모두 지원
   */
  async previewRestore(request: RestorePreviewRequest): Promise<RestorePreviewResponse> {
    const items: RestorePreviewResponse['items'] = [];
    const summary = { available: 0, notFound: 0, conflict: 0 };

    const trashMetadataIds = request.trashMetadataIds || [];

    for (const id of trashMetadataIds) {
      const trashMetadata = await this.trashDomainService.조회(id);
      if (!trashMetadata) {
        continue;
      }

      // 파일 복구 미리보기
      if (trashMetadata.isFile()) {
        const file = await this.fileDomainService.조회(trashMetadata.fileId!);
        if (!file) {
          continue;
        }

        // 1. 경로명으로 폴더 존재 여부 확인
        // originalPath는 파일의 전체 경로 (예: "/projects/2024/report.pdf")
        // 부모 폴더 경로를 추출해야 함 (예: "/projects/2024/")
        const originalPath = trashMetadata.originalPath;
        const parentFolderPath = this.extractParentFolderPath(originalPath);

        const targetFolder = await this.folderDomainService.조건조회({
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
          hasConflict = await this.fileDomainService.중복확인(
            targetFolder.id,
            file.name,
            file.mimeType,
            undefined, // excludeFileId
            file.createdAt, // createdAt 체크
          );

          if (hasConflict) {
            // 충돌 파일 ID 조회 (optional)
            const conflictFile = await this.fileDomainService.조건조회({
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
      // 폴더 복구 미리보기
      else if (trashMetadata.isFolder()) {
        const folder = await this.folderDomainService.조회(trashMetadata.folderId!);
        if (!folder || !folder.isTrashed()) {
          continue;
        }

        const originalPath = trashMetadata.originalPath;
        const originalParentId = trashMetadata.originalParentId;

        let pathStatus = RestorePathStatus.NOT_FOUND;
        let resolveFolderId: string | null = null;
        let hasConflict = false;

        // 1. 부모 폴더 존재 여부 확인
        if (originalParentId) {
          const parentFolder = await this.folderDomainService.조회(originalParentId);
          if (parentFolder && parentFolder.isActive()) {
            pathStatus = RestorePathStatus.AVAILABLE;
            resolveFolderId = parentFolder.id;

            // 2. 동일 폴더명 중복 확인
            const existingFolder = await this.folderDomainService.조건조회({
              parentId: originalParentId,
              name: folder.name,
              state: FolderState.ACTIVE,
            });
            if (existingFolder) {
              hasConflict = true;
            }
          }
        } else {
          // 루트 폴더에 복구하는 경우
          const rootFolder = await this.folderDomainService.조건조회({
            parentId: null,
            state: FolderState.ACTIVE,
          });
          if (rootFolder) {
            pathStatus = RestorePathStatus.AVAILABLE;
            resolveFolderId = rootFolder.id;

            // 동일 폴더명 중복 확인 (루트 레벨)
            const existingFolder = await this.folderDomainService.조건조회({
              parentId: rootFolder.id,
              name: folder.name,
              state: FolderState.ACTIVE,
            });
            if (existingFolder) {
              hasConflict = true;
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
          fileId: folder.id, // 폴더의 경우 folderId를 fileId 필드에 사용
          fileName: folder.name,
          mimeType: 'folder',
          sizeBytes: 0,
          deletedAt: trashMetadata.deletedAt,
          pathStatus,
          originalPath,
          originalFolderId: originalParentId || '',
          resolveFolderId,
          hasConflict,
        });
      }
    }

    return {
      totalCount: items.length,
      items,
      summary,
    };
  }

  /**
   * 복원 실행
   * 파일과 폴더 모두 지원
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
      const trashMetadata = await this.trashDomainService.조회(item.trashMetadataId);
      if (!trashMetadata) {
        continue;
      }

      // 파일 복구
      if (trashMetadata.isFile()) {
        // 3. 파일 조회
        const file = await this.fileDomainService.조회(trashMetadata.fileId!);
        if (!file || !file.isTrashed()) {
          continue;
        }

        // 4. 복구 대상 폴더 결정
        let targetFolderId: string | null = null;

        if (item.targetFolderId) {
          // 사용자가 지정한 폴더
          const targetFolder = await this.folderDomainService.조회(item.targetFolderId);
          if (targetFolder) {
            targetFolderId = targetFolder.id;
          }
        } else {
          // 경로명으로 자동 찾기 (부모 폴더 경로 추출)
          const parentFolderPath = this.extractParentFolderPath(trashMetadata.originalPath);
          const resolvedFolder = await this.folderDomainService.조건조회({
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
        const hasConflict = await this.fileDomainService.중복확인(
          targetFolderId,
          file.name,
          file.mimeType,
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

        // 7. SyncEvent 생성 (PENDING)
        const syncEventId = uuidv4();
        const syncEvent = SyncEventFactory.createFileRestoreEvent({
          id: syncEventId,
          fileId: file.id,
          sourcePath: trashMetadata.originalPath,
          targetFolderId,
          trashMetadataId: item.trashMetadataId,
          userId,
        });
        await this.syncEventDomainService.저장(syncEvent);

        // 8. 큐에 복원 작업 추가
        const jobData: NasFileRestoreJobData = {
          fileId: file.id,
          action: 'restore',
          syncEventId,
          trashMetadataId: item.trashMetadataId,
          restoreTargetFolderId: targetFolderId,
          userId,
        };
        await this.jobQueuePort.addJob<NasFileRestoreJobData>(NAS_FILE_SYNC_QUEUE_PREFIX, jobData);

        // 9. 큐 등록 성공 시 QUEUED로 변경
        syncEvent.markQueued();
        await this.syncEventDomainService.저장(syncEvent);

        syncEventIds.push(syncEventId);
        queued++;
      }

      // 폴더 복구
      if (trashMetadata.isFolder()) {
        // 3. 폴더 조회
        const folder = await this.folderDomainService.조회(trashMetadata.folderId!);
        if (!folder || !folder.isTrashed()) {
          continue;
        }

        const originalPath = trashMetadata.originalPath;
        const originalParentId = trashMetadata.originalParentId;

        // 4. 부모 폴더 존재 확인
        let targetParentId: string | null = null;

        if (originalParentId) {
          const parentFolder = await this.folderDomainService.조회(originalParentId);
          if (parentFolder && parentFolder.isActive()) {
            targetParentId = parentFolder.id;
          }
        } else {
          // 루트 폴더에 복구하는 경우
          const rootFolder = await this.folderDomainService.조건조회({
            parentId: null,
            state: FolderState.ACTIVE,
          });
          if (rootFolder) {
            targetParentId = rootFolder.id;
          }
        }

        // 5. 경로 없으면 skip
        if (!targetParentId) {
          skipped++;
          skippedItems.push({
            trashMetadataId: item.trashMetadataId,
            fileName: folder.name,
            reason: 'PATH_NOT_FOUND',
            message: `원래경로가 사라져서 복구가 불가합니다. 복구 경로:${originalPath}`,
          });
          continue;
        }

        // 6. 동일 폴더명 중복 확인
        const existingFolder = await this.folderDomainService.조건조회({
          parentId: targetParentId,
          name: folder.name,
          state: FolderState.ACTIVE,
        });

        if (existingFolder) {
          skipped++;
          skippedItems.push({
            trashMetadataId: item.trashMetadataId,
            fileName: folder.name,
            reason: 'CONFLICT',
            message: `복구 경로에 동일 폴더명 존재하여 복구가 불가합니다. 복구 경로:${originalPath}`,
          });
          continue;
        }

        // 7. 휴지통 경로 계산 (trashMetadataId__{폴더명} 형식)
        const trashPath = `.trash/${item.trashMetadataId}__${folder.name}`;

        // 8. SyncEvent 생성 (PENDING)
        const syncEventId = uuidv4();
        const currentUserId = RequestContext.getUserId() || userId;
        const syncEvent = SyncEventFactory.createFolderRestoreEvent({
          id: syncEventId,
          folderId: folder.id,
          sourcePath: trashPath,
          targetPath: originalPath,
          trashPath,
          restorePath: originalPath,
          trashMetadataId: item.trashMetadataId,
          originalParentId: targetParentId,
          userId: currentUserId,
        });
        await this.syncEventDomainService.저장(syncEvent);

        // 9. 큐에 복원 작업 추가 (NAS 폴더 동기화)
        const jobData: NasFolderRestoreJobData = {
          folderId: folder.id,
          action: 'restore',
          syncEventId,
          trashPath,
          restorePath: originalPath,
          trashMetadataId: item.trashMetadataId,
          originalParentId: targetParentId,
        };
        await this.jobQueuePort.addJob<NasFolderRestoreJobData>(NAS_FOLDER_SYNC_QUEUE_PREFIX, jobData);

        // 10. 큐 등록 성공 시 QUEUED로 변경
        syncEvent.markQueued();
        await this.syncEventDomainService.저장(syncEvent);

        syncEventIds.push(syncEventId);
        queued++;
      }
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

    const syncEvents = await this.syncEventDomainService.아이디목록조회(syncEventIds);

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
   * 영구삭제 (파일/폴더 모두 지원)
   */
  async purge(trashMetadataId: string, userId: string): Promise<PurgeResponse> {
    // 1. 휴지통 메타데이터 조회
    const trashMetadata = await this.trashDomainService.조회(trashMetadataId);
    if (!trashMetadata) {
      throw new NotFoundException({
        code: 'TRASH_ITEM_NOT_FOUND',
        message: '휴지통 항목을 찾을 수 없습니다.',
      });
    }

    // 파일 영구삭제
    if (trashMetadata.isFile()) {
      const file = await this.fileDomainService.조회(trashMetadata.fileId!);
      if (!file || !file.isTrashed()) {
        throw new BadRequestException({
          code: 'FILE_NOT_IN_TRASH',
          message: '휴지통에 있는 파일만 영구 삭제할 수 있습니다.',
        });
      }


      //파일 영구삭제 상태로 변경
      file.permanentDelete();
      await this.fileDomainService.저장(file);

      //TRASH_METADATA 삭제
      await this.trashDomainService.삭제(trashMetadataId);

      // 큐에 영구삭제 작업 추가 (캐시/NAS 스토리지 삭제)
      // 파일 상태는 NAS 작업 완료 후 worker에서 변경
      const syncEventId = uuidv4();
      const jobData: NasFilePurgeJobData = {
        fileId: file.id,
        action: 'purge',
        syncEventId,
        trashMetadataId,
        userId,
      };


      await this.jobQueuePort.addJob<NasFilePurgeJobData>(NAS_FILE_SYNC_QUEUE_PREFIX, jobData);

      return {
        id: file.id,
        name: file.name,
        type: 'FILE',
        purgedAt: new Date().toISOString(),
      };
    }


    // 폴더 영구삭제
    if (trashMetadata.isFolder()) {
      const folder = await this.folderDomainService.조회(trashMetadata.folderId!);
      if (!folder || !folder.isTrashed()) {
        throw new BadRequestException({
          code: 'FOLDER_NOT_IN_TRASH',
          message: '휴지통에 있는 폴더만 영구 삭제할 수 있습니다.',
        });
      }

      // 휴지통 경로 계산 (trashMetadataId__{폴더명} 형식)
      const trashPath = `.trash/${trashMetadataId}__${folder.name}`;


      // 큐에 영구삭제 작업 추가 (NAS 스토리지 삭제)
      // 폴더 상태는 NAS 작업 완료 후 worker에서 변경
      const syncEventId = uuidv4();
      const jobData: NasFolderPurgeJobData = {
        folderId: folder.id,
        action: 'purge',
        syncEventId,
        trashPath,
        trashMetadataId,
      };


      //폴더 영구삭제 상태로 변경
      folder.permanentDelete();
      await this.folderDomainService.저장(folder);

      //TRASH_METADATA 삭제
      await this.trashDomainService.삭제(trashMetadataId);

      await this.jobQueuePort.addJob<NasFolderPurgeJobData>(NAS_FOLDER_SYNC_QUEUE_PREFIX, jobData);

      return {
        id: folder.id,
        name: folder.name,
        type: 'FOLDER',
        purgedAt: new Date().toISOString(),
      };
    }

    throw new BadRequestException({
      code: 'INVALID_TRASH_ITEM',
      message: '유효하지 않은 휴지통 항목입니다.',
    });
  }

  /**
   * 파일 영구삭제 (하위 호환성 유지)
   * @deprecated purge 메서드를 사용하세요
   */
  async purgeFile(trashMetadataId: string, userId: string): Promise<PurgeResponse> {
    return this.purge(trashMetadataId, userId);
  }

  /**
   * 휴지통 비우기 (파일/폴더 모두)
   */
  async emptyTrash(userId: string): Promise<EmptyTrashResponse> {
    const trashItems = await this.trashDomainService.전체목록조회();

    let success = 0;
    let failed = 0;

    for (const item of trashItems) {
      try {
        // 파일과 폴더 모두 purge 메서드로 처리
        await this.purge(item.id, userId);
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
