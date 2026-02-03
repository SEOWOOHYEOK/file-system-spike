/**
 * ============================================================
 * 📦 NAS 폴더 동기화 워커 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - NasFolderSyncWorker
 *
 * 📋 비즈니스 맥락:
 *   - NAS 폴더 동기화 작업 처리
 *   - SyncEvent 상태 관리 (PENDING → PROCESSING → DONE/FAILED)
 *   - 폴더 생성, 이름 변경, 이동, 휴지통 이동 처리
 *
 * ⚠️ 중요 고려사항:
 *   - 작업 시작 시 SyncEvent를 PROCESSING으로 변경
 *   - 작업 성공 시 SyncEvent를 DONE으로 변경
 *   - 작업 실패 시 SyncEvent 재시도 또는 FAILED로 변경
 * ============================================================
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NasFolderSyncWorker } from './nas-folder-sync.worker';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import { DISTRIBUTED_LOCK_PORT } from '../../domain/queue/ports/distributed-lock.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import {
  FOLDER_REPOSITORY,
  FolderAvailabilityStatus,
} from '../../domain/folder';
import { FOLDER_STORAGE_OBJECT_REPOSITORY } from '../../domain/storage';
import { TRASH_REPOSITORY } from '../../domain/trash';
import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import {
  SyncEventEntity,
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../domain/sync-event/entities/sync-event.entity';

describe('NasFolderSyncWorker', () => {
  const mockJobQueue = {
    processJobs: jest.fn(),
  };
  const mockDistributedLock = {
    acquire: jest.fn(),
    withLock: jest.fn((key: string, fn: () => Promise<any>) => fn()),
    isLocked: jest.fn(),
    forceRelease: jest.fn(),
  };
  const mockNasStorage = {
    폴더생성: jest.fn(),
    폴더이동: jest.fn(),
    폴더삭제: jest.fn(),
  };
  const mockFolderRepository = {
    findById: jest.fn(),
    save: jest.fn(),
  };
  const mockFolderStorageObjectRepository = {
    findByFolderId: jest.fn(),
    findByObjectKeyPrefix: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
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

  let worker: NasFolderSyncWorker;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NasFolderSyncWorker,
        { provide: JOB_QUEUE_PORT, useValue: mockJobQueue },
        { provide: DISTRIBUTED_LOCK_PORT, useValue: mockDistributedLock },
        { provide: NAS_STORAGE_PORT, useValue: mockNasStorage },
        { provide: FOLDER_REPOSITORY, useValue: mockFolderRepository },
        { provide: FOLDER_STORAGE_OBJECT_REPOSITORY, useValue: mockFolderStorageObjectRepository },
        { provide: TRASH_REPOSITORY, useValue: mockTrashRepository },
        { provide: SYNC_EVENT_REPOSITORY, useValue: mockSyncEventRepository },
      ],
    }).compile();

    worker = module.get<NasFolderSyncWorker>(NasFolderSyncWorker);
    jest.clearAllMocks();
  });

  /**
   * ============================================================
   * 📦 SyncEvent 상태 관리 테스트
   * ============================================================
   */
  describe('SyncEvent 상태 관리', () => {
    /**
     * 📌 테스트 시나리오: 폴더 생성 성공 시 SyncEvent DONE 처리
     *
     * 🎯 검증 목적:
     *   작업 성공 시 SyncEvent 상태가 DONE으로 변경되어야 한다.
     *
     * ✅ 기대 결과:
     *   - SyncEvent.startProcessing() 호출
     *   - SyncEvent.complete() 호출
     *   - SyncEvent 저장
     */
    it('폴더 생성 성공 시 SyncEvent를 PROCESSING → DONE으로 업데이트해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folderId = 'folder-1';
      const syncEventId = 'sync-event-1';
      const folderPath = '/org/dept/new-folder';

      const mockSyncEvent = new SyncEventEntity({
        id: syncEventId,
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FOLDER,
        folderId,
        sourcePath: '',
        targetPath: folderPath,
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSyncEventRepository.findById.mockResolvedValue(mockSyncEvent);
      mockSyncEventRepository.save.mockResolvedValue(mockSyncEvent);

      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue({
        id: 'storage-1',
        folderId,
        objectKey: folderPath,
        availabilityStatus: FolderAvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      await worker.onModuleInit();
      const mkdirProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await mkdirProcessor({ data: { folderId, path: folderPath, syncEventId } });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockSyncEventRepository.findById).toHaveBeenCalledWith(syncEventId);
      expect(mockSyncEventRepository.save).toHaveBeenCalled();

      // 저장된 SyncEvent의 상태 확인
      const savedSyncEvent = mockSyncEventRepository.save.mock.calls[0][0];
      expect(savedSyncEvent.status).toBe(SyncEventStatus.DONE);
    });

    /**
     * 📌 테스트 시나리오: 폴더 생성 실패 시 SyncEvent retry 처리
     *
     * 🎯 검증 목적:
     *   작업 실패 시 재시도 가능하면 PENDING으로 복귀, 아니면 FAILED
     *
     * ✅ 기대 결과:
     *   - SyncEvent.retry() 호출 (retryCount 증가)
     *   - 에러 메시지 기록
     */
    it('폴더 생성 실패 시 SyncEvent retry 처리해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folderId = 'folder-1';
      const syncEventId = 'sync-event-1';
      const folderPath = '/org/dept/new-folder';

      const mockSyncEvent = new SyncEventEntity({
        id: syncEventId,
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FOLDER,
        folderId,
        sourcePath: '',
        targetPath: folderPath,
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSyncEventRepository.findById.mockResolvedValue(mockSyncEvent);
      mockSyncEventRepository.save.mockResolvedValue(mockSyncEvent);

      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue({
        id: 'storage-1',
        folderId,
        objectKey: folderPath,
        availabilityStatus: FolderAvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      // 폴더 생성 실패 시뮬레이션
      mockNasStorage.폴더생성.mockRejectedValue(new Error('NAS folder creation failed'));

      await worker.onModuleInit();
      const mkdirProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await expect(
        mkdirProcessor({ data: { folderId, path: folderPath, syncEventId } }),
      ).rejects.toThrow('NAS folder creation failed');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockSyncEventRepository.save).toHaveBeenCalled();

      // 저장된 SyncEvent의 상태 확인
      const savedSyncEvent = mockSyncEventRepository.save.mock.calls[0][0];
      expect(savedSyncEvent.retryCount).toBe(1);
      expect(savedSyncEvent.errorMessage).toBe('NAS folder creation failed');
    });

    /**
     * 📌 테스트 시나리오: syncEventId 없이도 작업 처리 가능 (하위 호환성)
     *
     * 🎯 검증 목적:
     *   syncEventId가 없는 기존 작업도 정상 처리되어야 한다.
     *
     * ✅ 기대 결과:
     *   - SyncEvent 조회/업데이트 없이 작업 완료
     */
    it('syncEventId 없이도 작업이 정상 처리되어야 한다 (하위 호환성)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folderId = 'folder-1';
      const folderPath = '/org/dept/new-folder';

      // Mock 초기화 (이전 테스트의 mockRejectedValue 제거)
      mockNasStorage.폴더생성.mockReset();
      mockNasStorage.폴더생성.mockResolvedValue(undefined);

      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue({
        id: 'storage-1',
        folderId,
        objectKey: folderPath,
        availabilityStatus: FolderAvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      await worker.onModuleInit();
      const mkdirProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행) - syncEventId 없이 호출
      // ═══════════════════════════════════════════════════════
      await mkdirProcessor({ data: { folderId, path: folderPath } });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // SyncEvent 조회는 호출되지 않아야 함 (syncEventId가 없으므로)
      expect(mockSyncEventRepository.findById).not.toHaveBeenCalled();
      // 작업은 정상 완료
      expect(mockNasStorage.폴더생성).toHaveBeenCalledWith(folderPath);
    });

    /**
     * 📌 테스트 시나리오: 폴더 이름 변경 성공 시 SyncEvent DONE 처리
     *
     * 🎯 검증 목적:
     *   폴더 이름 변경 성공 시 SyncEvent가 DONE으로 변경되어야 한다.
     *
     * ✅ 기대 결과:
     *   - SyncEvent 상태가 DONE으로 변경됨
     */
    it('폴더 이름 변경 성공 시 SyncEvent를 DONE으로 업데이트해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folderId = 'folder-1';
      const syncEventId = 'sync-event-2';
      const oldPath = '/org/dept/old-name';
      const newPath = '/org/dept/new-name';

      const mockSyncEvent = new SyncEventEntity({
        id: syncEventId,
        eventType: SyncEventType.RENAME,
        targetType: SyncEventTargetType.FOLDER,
        folderId,
        sourcePath: oldPath,
        targetPath: newPath,
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSyncEventRepository.findById.mockResolvedValue(mockSyncEvent);
      mockSyncEventRepository.save.mockResolvedValue(mockSyncEvent);

      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue({
        id: 'storage-1',
        folderId,
        objectKey: oldPath,
        availabilityStatus: FolderAvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      mockFolderStorageObjectRepository.findByObjectKeyPrefix.mockResolvedValue([]);

      await worker.onModuleInit();
      const renameProcessor = mockJobQueue.processJobs.mock.calls[1][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await renameProcessor({ data: { folderId, oldPath, newPath, syncEventId } });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockSyncEventRepository.findById).toHaveBeenCalledWith(syncEventId);

      // 저장된 SyncEvent의 상태 확인 - DONE으로 변경됨
      const savedSyncEvent = mockSyncEventRepository.save.mock.calls[0][0];
      expect(savedSyncEvent.status).toBe(SyncEventStatus.DONE);
    });
  });

  /**
   * ============================================================
   * 📦 Purge 액션 테스트
   * ============================================================
   */
  describe('Purge 액션 처리', () => {
    /**
     * 📌 테스트 시나리오: purge action 처리 - NAS 삭제 후 폴더 상태 변경
     * 
     * 🎯 검증 목적:
     *   - NAS 폴더 삭제 완료 후 folder.permanentDelete() 호출
     *   - 상태 변경은 NAS 작업 완료 후에만 수행
     */
    it('purge action은 NAS 삭제 완료 후 folder.permanentDelete()를 호출해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const folderId = 'folder-1';
      const trashMetadataId = 'trash-meta-1';
      const trashPath = '.trash/trash-meta-1__test-folder';
      const permanentDeleteMock = jest.fn();

      const mockFolder = {
        id: folderId,
        name: 'test-folder',
        permanentDelete: permanentDeleteMock,
      };

      mockFolderRepository.findById.mockResolvedValue(mockFolder);
      mockFolderRepository.save.mockResolvedValue(mockFolder);
      
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue({
        id: 'storage-1',
        folderId,
        objectKey: trashPath,
      });
      mockFolderStorageObjectRepository.delete.mockResolvedValue(undefined);
      mockNasStorage.폴더삭제.mockResolvedValue(undefined);
      mockTrashRepository.delete.mockResolvedValue(undefined);

      await worker.onModuleInit();
      // purge는 통합 큐에서 처리됨
      const folderSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await folderSyncProcessor({
        data: {
          folderId,
          action: 'purge',
          trashPath,
          trashMetadataId,
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      // 핵심: NAS 삭제 완료 후 permanentDelete() 호출
      expect(mockNasStorage.폴더삭제).toHaveBeenCalledWith(trashPath);
      expect(permanentDeleteMock).toHaveBeenCalled();
      expect(mockFolderRepository.save).toHaveBeenCalledWith(mockFolder);
      expect(mockTrashRepository.delete).toHaveBeenCalledWith(trashMetadataId);
    });

    /**
     * 📌 테스트 시나리오: purge action - 폴더가 없으면 조기 종료
     */
    it('purge action에서 폴더를 찾을 수 없으면 조기 종료해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN
      // ═══════════════════════════════════════════════════════
      const folderId = 'non-existent-folder';
      const trashMetadataId = 'trash-meta-1';
      const trashPath = '.trash/trash-meta-1__test-folder';

      mockFolderRepository.findById.mockResolvedValue(null);

      await worker.onModuleInit();
      const folderSyncProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN
      // ═══════════════════════════════════════════════════════
      await folderSyncProcessor({
        data: {
          folderId,
          action: 'purge',
          trashPath,
          trashMetadataId,
        },
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN
      // ═══════════════════════════════════════════════════════
      // 폴더가 없으면 NAS 삭제나 상태 변경이 수행되지 않아야 함
      expect(mockNasStorage.폴더삭제).not.toHaveBeenCalled();
      expect(mockFolderRepository.save).not.toHaveBeenCalled();
    });
  });
});
