import { Test, TestingModule } from '@nestjs/testing';

// Mock uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { TrashRestoreWorker, FileRestoreJobData, FilePurgeJobData } from './trash-restore.worker';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import {
  FILE_REPOSITORY
} from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import { FILE_STORAGE_OBJECT_REPOSITORY } from '../../domain/storage';
import { FOLDER_REPOSITORY } from '../../domain/folder';
import { TRASH_REPOSITORY } from '../../domain/trash';
import { SYNC_EVENT_REPOSITORY, SyncEventStatus } from '../../domain/sync-event';

// Mock services
const mockJobQueue = {
  processJobs: jest.fn(),
  addJob: jest.fn(),
};

const mockCacheStorage = {
  파일삭제: jest.fn(),
};

const mockNasStorage = {
  파일이동: jest.fn(),
  파일삭제: jest.fn(),
};

const mockFileRepository = {
  findById: jest.fn(),
  save: jest.fn(),
};

const mockFileStorageObjectRepository = {
  findByFileIdAndType: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
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
  updateStatus: jest.fn(),
};

/**
 * ============================================================
 * 📦 휴지통 복원/삭제 워커 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - TrashRestoreWorker (restore/purge 처리)
 *
 * 📋 비즈니스 맥락:
 *   - 복원/삭제 작업은 sync_event 상태 전이와 재시도 규칙을 지켜야 한다.
 * ============================================================
 */
describe('TrashRestoreWorker', () => {
  let worker: TrashRestoreWorker;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashRestoreWorker,
        { provide: JOB_QUEUE_PORT, useValue: mockJobQueue },
        { provide: CACHE_STORAGE_PORT, useValue: mockCacheStorage },
        { provide: NAS_STORAGE_PORT, useValue: mockNasStorage },
        { provide: FILE_REPOSITORY, useValue: mockFileRepository },
        { provide: FILE_STORAGE_OBJECT_REPOSITORY, useValue: mockFileStorageObjectRepository },
        { provide: FOLDER_REPOSITORY, useValue: mockFolderRepository },
        { provide: TRASH_REPOSITORY, useValue: mockTrashRepository },
        { provide: SYNC_EVENT_REPOSITORY, useValue: mockSyncEventRepository },
      ],
    }).compile();

    worker = module.get<TrashRestoreWorker>(TrashRestoreWorker);

    jest.clearAllMocks();
  });

  /**
   * 📌 테스트 시나리오: 워커 인스턴스 생성
   *
   * 🎯 검증 목적:
   *   - DI 설정이 정상적으로 구성되었는지 확인
   *
   * ✅ 기대 결과:
   *   - worker가 정의되어 있음
   */
  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  describe('onModuleInit', () => {
    /**
     * 📌 테스트 시나리오: 잡 프로세서 등록
     *
     * 🎯 검증 목적:
     *   - 복원/삭제 큐가 정상적으로 등록되어야 비동기 작업이 수행됨
     *
     * ✅ 기대 결과:
     *   - file-restore, file-purge 프로세서가 등록됨
     */
    it('should register job processors', async () => {
      await worker.onModuleInit();

      expect(mockJobQueue.processJobs).toHaveBeenCalledTimes(2);
      expect(mockJobQueue.processJobs).toHaveBeenCalledWith('file-restore', expect.any(Function));
      expect(mockJobQueue.processJobs).toHaveBeenCalledWith('file-purge', expect.any(Function));
    });
  });

  /**
   * ============================================================
   * 📦 파일 복원 처리 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - processRestoreJob
   *
   * 📋 비즈니스 맥락:
   *   - NAS 복원 실패 시 재시도 정책과 상태 전이를 보장해야 함
   * ============================================================
   */
  describe('processRestoreJob', () => {
    /**
     * 📌 테스트 시나리오: 정상 복원 처리
     *
     * 🎯 검증 목적:
     *   - restore 플로우가 정상 완료되어 DONE으로 전이되는지 확인
     *
     * ✅ 기대 결과:
     *   - NAS 이동/메타 삭제 후 sync_event DONE
     */
    it('should restore file successfully', async () => {
      // Given
      const jobData: FileRestoreJobData = {
        syncEventId: 'sync-1',
        trashMetadataId: 'trash-1',
        fileId: 'file-1',
        targetFolderId: 'folder-1',
        userId: 'user-1',
      };

      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash-1',
        fileId: 'file-1',
        originalPath: '/old-path/',
      });

      mockFileRepository.findById.mockResolvedValue({
        id: 'file-1',
        name: 'test.txt',
        state: FileState.TRASHED,
        restore: jest.fn(),
      });

      mockFolderRepository.findById.mockResolvedValue({
        id: 'folder-1',
        path: '/new-path',
        isActive: () => true,
      });

      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'naso-1',
        objectKey: '/.trash/old-key',
        updateObjectKey: jest.fn(),
        updateStatus: jest.fn(),
      });

      mockNasStorage.파일이동.mockResolvedValue(undefined);

      // Register and get the processor
      await worker.onModuleInit();
      const restoreProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // When
      await restoreProcessor({ data: jobData });

      // Then
      expect(mockSyncEventRepository.updateStatus).toHaveBeenCalledWith(
        'sync-1',
        SyncEventStatus.PROCESSING,
      );
      expect(mockNasStorage.파일이동).toHaveBeenCalled();
      expect(mockTrashRepository.delete).toHaveBeenCalledWith('trash-1');
      expect(mockSyncEventRepository.updateStatus).toHaveBeenCalledWith(
        'sync-1',
        SyncEventStatus.DONE,
      );
    });

    /**
     * 📌 테스트 시나리오: 타임스탬프 파일명 유지 복원
     *
     * 🎯 검증 목적:
     *   - NAS 저장 규칙(타임스탬프 포함)이 복원 시에도 유지되어야 함
     *
     * ✅ 기대 결과:
     *   - NAS 이동 및 objectKey가 타임스탬프 포함 경로로 업데이트
     */
    it('should preserve NAS filename with timestamp prefix when restoring', async () => {
      // Given - NAS에 타임스탬프 프리픽스가 붙은 파일명으로 저장됨
      const jobData: FileRestoreJobData = {
        syncEventId: 'sync-ts',
        trashMetadataId: 'trash-ts',
        fileId: 'file-ts',
        targetFolderId: 'folder-root',
        userId: 'user-1',
      };

      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash-ts',
        fileId: 'file-ts',
        originalPath: '/333.txt',
      });

      mockFileRepository.findById.mockResolvedValue({
        id: 'file-ts',
        name: '333.txt',  // DB상 파일명 (타임스탬프 없음)
        state: FileState.TRASHED,
        restore: jest.fn(),
      });

      mockFolderRepository.findById.mockResolvedValue({
        id: 'folder-root',
        path: '/',  // 루트 폴더
        isActive: () => true,
      });

      const mockNasObject = {
        id: 'naso-ts',
        objectKey: '.trash/1769424469467_333.txt',  // NAS에 저장된 실제 파일명 (타임스탬프 포함)
        updateObjectKey: jest.fn(),
        updateStatus: jest.fn(),
      };
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue(mockNasObject);
      mockFileStorageObjectRepository.save.mockResolvedValue(mockNasObject);

      mockNasStorage.파일이동.mockResolvedValue(undefined);

      await worker.onModuleInit();
      const restoreProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // When
      await restoreProcessor({ data: jobData });

      // Then - 핵심: NAS 파일명(타임스탬프 포함)이 유지되어야 함
      expect(mockNasStorage.파일이동).toHaveBeenCalledWith(
        '.trash/1769424469467_333.txt',  // 휴지통 경로
        '/1769424469467_333.txt',         // 복원 경로 (타임스탬프 유지!)
      );

      // NAS 객체의 objectKey도 올바르게 업데이트되어야 함
      expect(mockNasObject.updateObjectKey).toHaveBeenCalledWith('/1769424469467_333.txt');
    });

    /**
     * 📌 테스트 시나리오: NAS 복원 실패지만 재시도 가능
     *
     * 🎯 검증 목적:
     *   - retryCount < maxRetries이면 FAILED로 확정하지 않고 재시도해야 한다
     *
     * ✅ 기대 결과:
     *   - 예외가 throw되고 FAILED 업데이트는 수행하지 않음
     */
    it('NAS 복원 실패 시 재시도 가능하면 FAILED로 확정하지 않아야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const jobData: FileRestoreJobData = {
        syncEventId: 'sync-retry',
        trashMetadataId: 'trash-retry',
        fileId: 'file-retry',
        targetFolderId: 'folder-retry',
        userId: 'user-1',
      };

      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash-retry',
        fileId: 'file-retry',
        originalPath: '/old-path/',
      });
      mockFileRepository.findById.mockResolvedValue({
        id: 'file-retry',
        name: 'retry.txt',
        state: FileState.TRASHED,
        restore: jest.fn(),
      });
      mockFolderRepository.findById.mockResolvedValue({
        id: 'folder-retry',
        path: '/new-path',
        isActive: () => true,
      });
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'naso-retry',
        objectKey: '/.trash/retry-key',
        updateObjectKey: jest.fn(),
        updateStatus: jest.fn(),
      });
      mockNasStorage.파일이동.mockRejectedValue(new Error('NAS_FAIL'));
      mockSyncEventRepository.findById.mockResolvedValue({
        id: 'sync-retry',
        retryCount: 0,
        maxRetries: 3,
      });

      await worker.onModuleInit();
      const restoreProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(restoreProcessor({ data: jobData })).rejects.toThrow('NAS_FAIL');
      expect(mockSyncEventRepository.updateStatus).not.toHaveBeenCalledWith(
        'sync-retry',
        SyncEventStatus.FAILED,
        expect.any(String),
      );
    });

    /**
     * 📌 테스트 시나리오: NAS 복원 실패 + 최대 재시도 초과
     *
     * 🎯 검증 목적:
     *   - 재시도 한계 도달 시 FAILED로 확정해야 한다
     *
     * ✅ 기대 결과:
     *   - FAILED 상태 업데이트 호출
     */
    it('NAS 복원 실패 후 재시도 한계를 넘으면 FAILED로 마킹해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const jobData: FileRestoreJobData = {
        syncEventId: 'sync-fail',
        trashMetadataId: 'trash-fail',
        fileId: 'file-fail',
        targetFolderId: 'folder-fail',
        userId: 'user-1',
      };

      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash-fail',
        fileId: 'file-fail',
        originalPath: '/old-path/',
      });
      mockFileRepository.findById.mockResolvedValue({
        id: 'file-fail',
        name: 'fail.txt',
        state: FileState.TRASHED,
        restore: jest.fn(),
      });
      mockFolderRepository.findById.mockResolvedValue({
        id: 'folder-fail',
        path: '/new-path',
        isActive: () => true,
      });
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'naso-fail',
        objectKey: '/.trash/fail-key',
        updateObjectKey: jest.fn(),
        updateStatus: jest.fn(),
      });
      mockNasStorage.파일이동.mockRejectedValue(new Error('NAS_FAIL'));
      mockSyncEventRepository.findById.mockResolvedValue({
        id: 'sync-fail',
        retryCount: 3,
        maxRetries: 3,
      });

      await worker.onModuleInit();
      const restoreProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await restoreProcessor({ data: jobData });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockSyncEventRepository.updateStatus).toHaveBeenCalledWith(
        'sync-fail',
        SyncEventStatus.FAILED,
        'NAS_FAIL',
      );
    });

    /**
     * 📌 테스트 시나리오: 대상 폴더 삭제됨
     *
     * 🎯 검증 목적:
     *   - 2차 방어로 폴더 존재 여부를 확인해야 함
     *
     * ✅ 기대 결과:
     *   - SyncEvent FAILED 처리 (TARGET_FOLDER_NOT_FOUND)
     */
    it('should fail when target folder is deleted', async () => {
      // Given
      const jobData: FileRestoreJobData = {
        syncEventId: 'sync-1',
        trashMetadataId: 'trash-1',
        fileId: 'file-1',
        targetFolderId: 'folder-deleted',
        userId: 'user-1',
      };

      mockTrashRepository.findById.mockResolvedValue({
        id: 'trash-1',
        fileId: 'file-1',
      });

      mockFileRepository.findById.mockResolvedValue({
        id: 'file-1',
        name: 'test.txt',
      });

      // Folder is deleted
      mockFolderRepository.findById.mockResolvedValue(null);

      await worker.onModuleInit();
      const restoreProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // When
      await restoreProcessor({ data: jobData });

      // Then
      expect(mockSyncEventRepository.updateStatus).toHaveBeenCalledWith(
        'sync-1',
        SyncEventStatus.FAILED,
        'TARGET_FOLDER_NOT_FOUND',
      );
    });
  });

  /**
   * ============================================================
   * 📦 파일 영구 삭제 처리 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - processPurgeJob
   *
   * 📋 비즈니스 맥락:
   *   - 캐시/NAS 삭제와 sync_event 완료 상태를 보장해야 함
   * ============================================================
   */
  describe('processPurgeJob', () => {
    /**
     * 📌 테스트 시나리오: 캐시와 NAS 모두 삭제
     *
     * 🎯 검증 목적:
     *   - 실제 저장소 정리 후 DONE 상태로 전이해야 함
     *
     * ✅ 기대 결과:
     *   - 캐시/NAS 삭제 호출, sync_event DONE
     */
    it('should purge file from cache and NAS', async () => {
      // Given
      const jobData: FilePurgeJobData = {
        syncEventId: 'sync-2',
        fileId: 'file-2',
        trashMetadataId: 'trash-2',
        userId: 'user-1',
      };

      mockFileRepository.findById.mockResolvedValue({
        id: 'file-2',
        name: 'delete-me.txt',
      });

      mockFileStorageObjectRepository.findByFileIdAndType
        .mockResolvedValueOnce({
          id: 'cache-obj',
          objectKey: 'cache-key',
        })
        .mockResolvedValueOnce({
          id: 'nas-obj',
          objectKey: 'nas-key',
        });

      mockCacheStorage.파일삭제.mockResolvedValue(undefined);
      mockNasStorage.파일삭제.mockResolvedValue(undefined);

      await worker.onModuleInit();
      const purgeProcessor = mockJobQueue.processJobs.mock.calls[1][1];

      // When
      await purgeProcessor({ data: jobData });

      // Then
      expect(mockCacheStorage.파일삭제).toHaveBeenCalledWith('cache-key');
      expect(mockNasStorage.파일삭제).toHaveBeenCalledWith('nas-key');
      expect(mockFileStorageObjectRepository.delete).toHaveBeenCalledTimes(2);
      expect(mockSyncEventRepository.updateStatus).toHaveBeenCalledWith(
        'sync-2',
        SyncEventStatus.DONE,
      );
    });
  });
});
