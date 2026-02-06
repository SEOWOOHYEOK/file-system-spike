/**
 * ============================================================
 * 📦 NAS 파일 동기화 워커 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - NasSyncWorker (라우터 역할)
 *   - 개별 핸들러들은 각자의 spec에서 테스트
 *
 * 📋 비즈니스 맥락:
 *   - NAS 파일 동기화 작업 처리
 *   - SyncEvent 상태 관리 (PENDING → PROCESSING → DONE/FAILED)
 *   - 기존 NAS 파일명에 포함된 타임스탬프는 유지되어야 한다.
 *
 * ⚠️ 중요 고려사항:
 *   - 작업 시작 시 SyncEvent를 PROCESSING으로 변경
 *   - 작업 성공 시 SyncEvent를 DONE으로 변경
 *   - 작업 실패 시 SyncEvent 재시도 또는 FAILED로 변경
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NasSyncWorker, NAS_FILE_SYNC_QUEUE_PREFIX } from './nas-file-sync.worker';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import { DISTRIBUTED_LOCK_PORT } from '../../domain/queue/ports/distributed-lock.port';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import { PROGRESS_STORAGE_PORT } from '../../domain/queue/ports/progress-storage.port';
import { FILE_REPOSITORY, StorageType, AvailabilityStatus } from '../../domain/file';
import { FILE_STORAGE_OBJECT_REPOSITORY } from '../../domain/storage/file/repositories/file-storage-object.repository.interface';
import { FOLDER_REPOSITORY } from '../../domain/folder';
import { TRASH_REPOSITORY } from '../../domain/trash';
import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import { TRASH_QUERY_SERVICE } from '../../domain/trash/repositories/trash.repository.interface';
import { SyncEventEntity, SyncEventStatus, SyncEventType, SyncEventTargetType } from '../../domain/sync-event/entities/sync-event.entity';

// Domain Services (needed by handlers)
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { FolderDomainService } from '../../domain/folder/service/folder-domain.service';
import { TrashDomainService } from '../../domain/trash/service/trash-domain.service';
import { SyncEventDomainService } from '../../domain/sync-event/service/sync-event-domain.service';

// Handlers & Helpers
import { SyncEventLifecycleHelper } from './shared/sync-event-lifecycle.helper';
import { FileUploadHandler } from './handlers/file-upload.handler';
import { FileRenameHandler } from './handlers/file-rename.handler';
import { FileMoveHandler } from './handlers/file-move.handler';
import { FileTrashHandler } from './handlers/file-trash.handler';
import { FileRestoreHandler } from './handlers/file-restore.handler';
import { FilePurgeHandler } from './handlers/file-purge.handler';

describe('NasSyncWorker', () => {
  const mockJobQueue = {
    processJobs: jest.fn(),
  };
  const mockDistributedLock = {
    acquire: jest.fn(),
    withLock: jest.fn((key: string, fn: () => Promise<any>) => fn()),
    isLocked: jest.fn(),
    forceRelease: jest.fn(),
  };
  const mockCacheStorage = {
    파일스트림읽기: jest.fn(),
  };
  const mockNasStorage = {
    파일스트림쓰기: jest.fn(),
    파일이동: jest.fn(),
  };
  const mockProgressStorage = {
    set: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };
  const mockFileRepository = {
    findById: jest.fn(),
    save: jest.fn(),
  };
  const mockFileStorageObjectRepository = {
    findByFileIdAndType: jest.fn(),
    save: jest.fn(),
  };
  const mockFolderRepository = {
    findById: jest.fn(),
  };
  const mockTrashRepository = {
    findById: jest.fn(),
    delete: jest.fn(),
  };
  const mockSyncEventRepository = {
    findById: jest.fn(),
    save: jest.fn(),
    updateStatus: jest.fn(),
  };
  const mockTrashQueryService = {
    findByTargetId: jest.fn(),
    findByOriginalFolderId: jest.fn(),
  };

  let worker: NasSyncWorker;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NasSyncWorker,
        // Shared helpers
        SyncEventLifecycleHelper,
        // Domain Services (real classes with mocked repositories)
        FileDomainService,
        FileNasStorageDomainService,
        FileCacheStorageDomainService,
        FolderDomainService,
        TrashDomainService,
        SyncEventDomainService,
        // File action handlers
        FileUploadHandler,
        FileRenameHandler,
        FileMoveHandler,
        FileTrashHandler,
        FileRestoreHandler,
        FilePurgeHandler,
        // Ports
        { provide: JOB_QUEUE_PORT, useValue: mockJobQueue },
        { provide: DISTRIBUTED_LOCK_PORT, useValue: mockDistributedLock },
        { provide: CACHE_STORAGE_PORT, useValue: mockCacheStorage },
        { provide: NAS_STORAGE_PORT, useValue: mockNasStorage },
        { provide: PROGRESS_STORAGE_PORT, useValue: mockProgressStorage },
        // Repositories (consumed by domain services)
        { provide: FILE_REPOSITORY, useValue: mockFileRepository },
        { provide: FILE_STORAGE_OBJECT_REPOSITORY, useValue: mockFileStorageObjectRepository },
        { provide: FOLDER_REPOSITORY, useValue: mockFolderRepository },
        { provide: TRASH_REPOSITORY, useValue: mockTrashRepository },
        { provide: SYNC_EVENT_REPOSITORY, useValue: mockSyncEventRepository },
        { provide: TRASH_QUERY_SERVICE, useValue: mockTrashQueryService },
      ],
    }).compile();

    worker = module.get<NasSyncWorker>(NasSyncWorker);
    jest.clearAllMocks();
  });

  /**
   * ============================================================
   * 📦 통합 큐 (NAS_FILE_SYNC) 테스트
   * ============================================================
   *
   * 🎯 검증 목적:
   *   - 파일 기반 통합 큐가 올바르게 작동하는지 확인
   *   - 파일별 락을 통한 순차 처리 보장 검증
   * ============================================================
   */
  describe('processFileSyncJob (통합 큐)', () => {
    /**
     * 📌 테스트 시나리오: 통합 큐가 등록되어야 한다
     */
    it('onModuleInit에서 NAS_FILE_SYNC 큐가 concurrency와 함께 등록되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await worker.onModuleInit();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      expect(mockJobQueue.processJobs).toHaveBeenCalledWith(
        NAS_FILE_SYNC_QUEUE_PREFIX,
        expect.any(Function),
        expect.objectContaining({ concurrency: 5 }),
      );
    });

    /**
     * 📌 테스트 시나리오: 파일별 락을 사용해야 한다
     */
    it('작업 처리 시 파일별 락을 획득해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';

      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'nas-1',
        fileId,
        storageType: StorageType.NAS,
        objectKey: 'test.txt',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => true,
      });

      await worker.onModuleInit();
      
      // 첫 번째 호출이 NAS_FILE_SYNC 큐
      const fileSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await fileSyncProcessor({
        data: {
          fileId,
          action: 'upload',
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      expect(mockDistributedLock.withLock).toHaveBeenCalledWith(
        `file-sync:${fileId}`,
        expect.any(Function),
        expect.objectContaining({ ttl: 60000, waitTimeout: 30000 }),
      );
    });

    /**
     * 📌 테스트 시나리오: action에 따라 올바른 핸들러가 호출되어야 한다
     */
    it('upload action은 handleUpload를 실행해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';

      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'nas-1',
        fileId,
        storageType: StorageType.NAS,
        objectKey: 'test.txt',
        availabilityStatus: AvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      mockFileRepository.findById.mockResolvedValue({
        id: fileId,
        name: 'test.txt',
        createdAt: new Date(),
      });

      // mock stream with pipe method
      const mockStream = { pipe: jest.fn().mockReturnThis() };
      mockCacheStorage.파일스트림읽기.mockResolvedValue(mockStream);

      await worker.onModuleInit();
      const fileSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await fileSyncProcessor({
        data: {
          fileId,
          action: 'upload',
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      expect(mockCacheStorage.파일스트림읽기).toHaveBeenCalledWith(fileId);
      expect(mockNasStorage.파일스트림쓰기).toHaveBeenCalled();
    });

    /**
     * 📌 테스트 시나리오: rename action 처리
     */
    it('rename action은 handleRename를 실행해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const oldObjectKey = '1769478135014_old.txt';
      const newObjectKey = '1769478135014_new.txt';

      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'nas-1',
        fileId,
        storageType: StorageType.NAS,
        objectKey: oldObjectKey,
        availabilityStatus: AvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      await worker.onModuleInit();
      const fileSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await fileSyncProcessor({
        data: {
          fileId,
          action: 'rename',
          oldObjectKey,
          newObjectKey,
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      expect(mockNasStorage.파일이동).toHaveBeenCalledWith(
        oldObjectKey,
        '1769478135014_new.txt',
      );
    });

    /**
     * 📌 테스트 시나리오: trash action 처리
     */
    it('trash action은 handleTrash를 실행해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const currentObjectKey = '/folder/test.txt';
      const trashPath = '/.trash/test.txt';

      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'nas-1',
        fileId,
        storageType: StorageType.NAS,
        objectKey: currentObjectKey,
        availabilityStatus: AvailabilityStatus.SYNCING,
        leaseCount: 0,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      await worker.onModuleInit();
      const fileSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await fileSyncProcessor({
        data: {
          fileId,
          action: 'trash',
          currentObjectKey,
          trashPath,
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      expect(mockNasStorage.파일이동).toHaveBeenCalledWith(
        currentObjectKey,
        trashPath,
      );
    });

    /**
     * 📌 테스트 시나리오: purge action 처리 - NAS 삭제 후 파일 상태 변경
     * 
     * 🎯 검증 목적:
     *   - NAS 파일 삭제 완료 후 file.permanentDelete() 호출
     *   - 상태 변경은 NAS 작업 완료 후에만 수행
     */
    it('purge action은 NAS 삭제 완료 후 file.permanentDelete()를 호출해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const trashMetadataId = 'trash-meta-1';
      const permanentDeleteMock = jest.fn();

      const mockFile = {
        id: fileId,
        name: 'test.txt',
        permanentDelete: permanentDeleteMock,
        isTrashed: jest.fn().mockReturnValue(false),
      };

      mockFileRepository.findById.mockResolvedValue(mockFile);
      mockFileRepository.save.mockResolvedValue(mockFile);
      
      // NAS 스토리지 객체 (휴지통 경로)
      mockFileStorageObjectRepository.findByFileIdAndType
        .mockResolvedValueOnce({
          id: 'cache-1',
          fileId,
          storageType: StorageType.CACHE,
          objectKey: 'cache/test.txt',
        })
        .mockResolvedValueOnce({
          id: 'nas-1',
          fileId,
          storageType: StorageType.NAS,
          objectKey: '.trash/trash-meta-1__20240101000000__test.txt',
        });

      mockCacheStorage.파일삭제 = jest.fn().mockResolvedValue(undefined);
      mockNasStorage.파일삭제 = jest.fn().mockResolvedValue(undefined);
      mockFileStorageObjectRepository.delete = jest.fn().mockResolvedValue(undefined);
      mockTrashRepository.delete.mockResolvedValue(undefined);

      await worker.onModuleInit();
      const fileSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await fileSyncProcessor({
        data: {
          fileId,
          action: 'purge',
          trashMetadataId,
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      // 핵심: NAS 삭제 완료 후 permanentDelete() 호출
      expect(permanentDeleteMock).toHaveBeenCalled();
      expect(mockFileRepository.save).toHaveBeenCalledWith(mockFile, undefined);
      expect(mockTrashRepository.delete).toHaveBeenCalledWith(trashMetadataId);
    });

    /**
     * 📌 테스트 시나리오: restore action 처리 - trashMetadataId 접두사 제거
     * 
     * 🎯 검증 목적:
     *   - 복원 시 휴지통 파일명에서 trashMetadataId 접두사 제거
     *   - 원본 NAS 파일명으로 복원
     */
    it('restore action은 trashMetadataId 접두사를 제거하고 원본 파일명으로 복원해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const trashMetadataId = 'f60a60a5-fd18-4ca4-b56f-5e2a4cae74dd';
      const restoreTargetFolderId = 'folder-1';

      // 휴지통 파일명: {trashMetadataId}__20240101000000__test.txt
      const trashPath = `.trash/${trashMetadataId}__20260203023315__333.txt`;

      mockTrashRepository.findById.mockResolvedValue({
        id: trashMetadataId,
        fileId,
        originalPath: '/folder/333.txt',
      });

      const mockFile = {
        id: fileId,
        name: '333.txt',
        restore: jest.fn(),
        isTrashed: jest.fn().mockReturnValue(true),
      };
      mockFileRepository.findById.mockResolvedValue(mockFile);
      mockFileRepository.save.mockResolvedValue(mockFile);

      const mockFolder = {
        id: restoreTargetFolderId,
        path: '/folder',
        isActive: () => true,
      };
      mockFolderRepository.findById.mockResolvedValue(mockFolder);

      const updateObjectKeyMock = jest.fn();
      const updateStatusMock = jest.fn();
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'nas-1',
        fileId,
        storageType: StorageType.NAS,
        objectKey: trashPath, // 휴지통 경로
        updateObjectKey: updateObjectKeyMock,
        updateStatus: updateStatusMock,
      });
      mockFileStorageObjectRepository.save.mockResolvedValue(undefined);
      mockTrashRepository.delete.mockResolvedValue(undefined);

      await worker.onModuleInit();
      const fileSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await fileSyncProcessor({
        data: {
          fileId,
          action: 'restore',
          trashMetadataId,
          restoreTargetFolderId,
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      // 핵심: trashMetadataId 접두사 제거 후 원본 파일명으로 복원
      // 복원 경로: /folder/20260203023315__333.txt (trashMetadataId 제거됨)
      expect(mockNasStorage.파일이동).toHaveBeenCalledWith(
        trashPath,
        '/folder/20260203023315__333.txt', // trashMetadataId 접두사 제거됨
      );
      expect(updateObjectKeyMock).toHaveBeenCalledWith('/folder/20260203023315__333.txt');
    });
  });
});
