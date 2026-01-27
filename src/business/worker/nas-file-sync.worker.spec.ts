/**
 * ============================================================
 * 📦 NAS 파일 동기화 워커 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - NasSyncWorker.processRenameJob
 *
 * 📋 비즈니스 맥락:
 *   - 기존 NAS 파일명에 포함된 타임스탬프는 유지되어야 한다.
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
import { FILE_REPOSITORY, FILE_STORAGE_OBJECT_REPOSITORY, StorageType, AvailabilityStatus } from '../../domain/file';
import { FOLDER_REPOSITORY } from '../../domain/folder';

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
});
