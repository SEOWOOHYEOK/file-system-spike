/**
 * ============================================================
 * 📦 NAS 파일 동기화 워커 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - NasSyncWorker
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
import { NasSyncWorker } from './nas-file-sync.worker';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import { FILE_REPOSITORY, StorageType, AvailabilityStatus } from '../../domain/file';
import { FILE_STORAGE_OBJECT_REPOSITORY } from '../../domain/storage';
import { FOLDER_REPOSITORY } from '../../domain/folder';
import { SYNC_EVENT_REPOSITORY } from '../../domain/sync-event/repositories/sync-event.repository.interface';
import { SyncEventEntity, SyncEventStatus, SyncEventType, SyncEventTargetType } from '../../domain/sync-event/entities/sync-event.entity';

describe('NasSyncWorker', () => {
  const mockJobQueue = {
    processJobs: jest.fn(),
  };
  const mockCacheStorage = {
    파일스트림읽기: jest.fn(),
  };
  const mockNasStorage = {
    파일스트림쓰기: jest.fn(),
    파일이동: jest.fn(),
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
  const mockSyncEventRepository = {
    findById: jest.fn(),
    save: jest.fn(),
    updateStatus: jest.fn(),
  };

  let worker: NasSyncWorker;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NasSyncWorker,
        { provide: JOB_QUEUE_PORT, useValue: mockJobQueue },
        { provide: CACHE_STORAGE_PORT, useValue: mockCacheStorage },
        { provide: NAS_STORAGE_PORT, useValue: mockNasStorage },
        { provide: FILE_REPOSITORY, useValue: mockFileRepository },
        { provide: FILE_STORAGE_OBJECT_REPOSITORY, useValue: mockFileStorageObjectRepository },
        { provide: FOLDER_REPOSITORY, useValue: mockFolderRepository },
        { provide: SYNC_EVENT_REPOSITORY, useValue: mockSyncEventRepository },
      ],
    }).compile();

    worker = module.get<NasSyncWorker>(NasSyncWorker);
    jest.clearAllMocks();
  });

  /**
   * ============================================================
   * 📦 파일명 변경 동기화 테스트
   * ============================================================
   */
  describe('processRenameJob', () => {
    /**
     * 📌 테스트 시나리오: 기존 타임스탬프 유지 rename
     *
     * 🎯 검증 목적:
     *   - 1769478135014_111.txt → 1769478135014_999.txt
     *
     * ✅ 기대 결과:
     *   - NAS 이동 경로가 기존 타임스탬프를 유지
     */
    it('기존 타임스탬프를 유지한 이름으로 NAS rename을 수행해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const oldObjectKey = '1769478135014_111.txt';
      const newObjectKey = '20260127014215__999.txt';

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

      // SyncEvent가 없는 경우도 처리해야 함 (하위 호환성)
      mockSyncEventRepository.findById.mockResolvedValue(null);

      await worker.onModuleInit();
      const renameProcessor = mockJobQueue.processJobs.mock.calls[1][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await renameProcessor({ data: { fileId, oldObjectKey, newObjectKey } });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockNasStorage.파일이동).toHaveBeenCalledWith(
        '1769478135014_111.txt',
        '1769478135014_999.txt',
      );
    });
  });

  /**
   * ============================================================
   * 📦 SyncEvent 상태 관리 테스트
   * ============================================================
   *
   * 🎯 검증 목적:
   *   - Worker가 작업 처리 시 SyncEvent 상태를 올바르게 업데이트하는지 확인
   *   - PENDING → PROCESSING → DONE 흐름 검증
   *   - 실패 시 retry 또는 FAILED 처리 검증
   * ============================================================
   */
  describe('SyncEvent 상태 관리', () => {
    /**
     * 📌 테스트 시나리오: 업로드 성공 시 SyncEvent DONE 처리
     *
     * 🎯 검증 목적:
     *   작업 성공 시 SyncEvent 상태가 DONE으로 변경되어야 한다.
     *
     * ✅ 기대 결과:
     *   - SyncEvent.startProcessing() 호출
     *   - SyncEvent.complete() 호출
     *   - SyncEvent 저장
     */
    it('업로드 성공 시 SyncEvent를 PROCESSING → DONE으로 업데이트해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const syncEventId = 'sync-event-1';

      const mockSyncEvent = new SyncEventEntity({
        id: syncEventId,
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId,
        sourcePath: '/cache/file1.pdf',
        targetPath: '/nas/file1.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSyncEventRepository.findById.mockResolvedValue(mockSyncEvent);
      mockSyncEventRepository.save.mockResolvedValue(mockSyncEvent);

      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'nas-1',
        fileId,
        storageType: StorageType.NAS,
        objectKey: 'nas/file1.pdf',
        availabilityStatus: AvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      mockFileRepository.findById.mockResolvedValue({
        id: fileId,
        name: 'file1.pdf',
        createdAt: new Date(),
      });

      mockCacheStorage.파일스트림읽기.mockResolvedValue({});

      await worker.onModuleInit();
      const uploadProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await uploadProcessor({ data: { fileId, syncEventId } });

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
     * 📌 테스트 시나리오: 업로드 실패 시 SyncEvent retry 처리
     *
     * 🎯 검증 목적:
     *   작업 실패 시 재시도 가능하면 PENDING으로 복귀, 아니면 FAILED
     *
     * ✅ 기대 결과:
     *   - SyncEvent.retry() 호출 (retryCount 증가)
     *   - 에러 메시지 기록
     */
    it('업로드 실패 시 SyncEvent retry 처리해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const syncEventId = 'sync-event-1';

      const mockSyncEvent = new SyncEventEntity({
        id: syncEventId,
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId,
        sourcePath: '/cache/file1.pdf',
        targetPath: '/nas/file1.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSyncEventRepository.findById.mockResolvedValue(mockSyncEvent);
      mockSyncEventRepository.save.mockResolvedValue(mockSyncEvent);

      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue({
        id: 'nas-1',
        fileId,
        storageType: StorageType.NAS,
        objectKey: 'nas/file1.pdf',
        availabilityStatus: AvailabilityStatus.SYNCING,
        updateStatus: jest.fn(),
        updateObjectKey: jest.fn(),
        isAvailable: () => false,
      });

      mockFileRepository.findById.mockResolvedValue({
        id: fileId,
        name: 'file1.pdf',
        createdAt: new Date(),
      });

      // 파일 읽기 실패 시뮬레이션
      mockCacheStorage.파일스트림읽기.mockRejectedValue(new Error('Cache read failed'));

      await worker.onModuleInit();
      const uploadProcessor = mockJobQueue.processJobs.mock.calls[0][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await expect(
        uploadProcessor({ data: { fileId, syncEventId } }),
      ).rejects.toThrow('Cache read failed');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(mockSyncEventRepository.save).toHaveBeenCalled();

      // 저장된 SyncEvent의 상태 확인
      const savedSyncEvent = mockSyncEventRepository.save.mock.calls[0][0];
      expect(savedSyncEvent.retryCount).toBe(1);
      expect(savedSyncEvent.errorMessage).toBe('Cache read failed');
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
      const fileId = 'file-1';
      const oldObjectKey = '1769478135014_test.txt';
      const newObjectKey = '1769478135014_renamed.txt';

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
      const renameProcessor = mockJobQueue.processJobs.mock.calls[1][1];

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행) - syncEventId 없이 호출
      // ═══════════════════════════════════════════════════════
      await renameProcessor({ data: { fileId, oldObjectKey, newObjectKey } });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // SyncEvent 조회는 호출되지 않아야 함 (syncEventId가 없으므로)
      expect(mockSyncEventRepository.findById).not.toHaveBeenCalled();
      // 작업은 정상 완료
      expect(mockNasStorage.파일이동).toHaveBeenCalled();
    });
  });
});
