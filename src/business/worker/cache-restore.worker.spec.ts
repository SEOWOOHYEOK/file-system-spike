/**
 * ============================================================
 * 캐시 복원 워커 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - CacheRestoreWorker
 *
 * 비즈니스 맥락:
 *   - NAS에서 다운로드된 파일을 캐시 서버에 비동기 복원
 *   - CACHE_RESTORE 큐 작업 처리
 *   - FileStorageObjectEntity (CACHE 타입) 생성/상태 관리
 *
 * 중요 고려사항:
 *   - 멱등성: 이미 캐시된 파일은 스킵
 *   - DB 상태 불일치 보정
 *   - NAS 상태 확인 후 복원 진행
 *   - 파일 무결성 검증 (사이즈 비교)
 *   - 에러 시 불완전 파일 정리 및 MISSING 마킹
 * ============================================================
 */

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { CacheRestoreWorker, CACHE_RESTORE_QUEUE } from './cache-restore.worker';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import { DISTRIBUTED_LOCK_PORT } from '../../domain/queue/ports/distributed-lock.port';
import { CACHE_STORAGE_PORT } from '../../domain/storage/ports/cache-storage.port';
import { NAS_STORAGE_PORT } from '../../domain/storage/ports/nas-storage.port';
import { FILE_STORAGE_OBJECT_REPOSITORY } from '../../domain/storage/file/repositories/file-storage-object.repository.interface';
import { FileNasStorageDomainService } from '../../domain/storage/file/service/file-nas-storage-domain.service';
import { FileCacheStorageDomainService } from '../../domain/storage/file/service/file-cache-storage-domain.service';
import { AvailabilityStatus, StorageType } from '../../domain/file';
import { FileStorageObjectEntity } from '../../domain/storage/file/entity/file-storage-object.entity';
import { Readable } from 'stream';

describe('CacheRestoreWorker', () => {
  // ═══════════════════════════════════════════════════════
  // Mock 정의
  // ═══════════════════════════════════════════════════════
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
    파일존재확인: jest.fn(),
    파일스트림쓰기: jest.fn(),
    파일크기조회: jest.fn(),
    파일삭제: jest.fn(),
  };

  const mockNasStorage = {
    파일스트림읽기: jest.fn(),
    파일크기조회: jest.fn(),
  };

  const mockFileStorageObjectRepository = {
    findByFileIdAndType: jest.fn(),
    findByFileIdAndTypeForUpdate: jest.fn(),
    save: jest.fn((entity: any) => entity),
  };

  let worker: CacheRestoreWorker;
  let processJobFn: (job: any) => Promise<void>;

  // ═══════════════════════════════════════════════════════
  // 헬퍼 함수
  // ═══════════════════════════════════════════════════════
  const createCacheObject = (overrides?: Partial<FileStorageObjectEntity>) =>
    new FileStorageObjectEntity({
      id: 'cache-obj-1',
      fileId: 'file-1',
      storageType: StorageType.CACHE,
      objectKey: 'file-1',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
      ...overrides,
    });

  const createNasObject = (overrides?: Partial<FileStorageObjectEntity>) =>
    new FileStorageObjectEntity({
      id: 'nas-obj-1',
      fileId: 'file-1',
      storageType: StorageType.NAS,
      objectKey: '2025/01/test.txt',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
      ...overrides,
    });

  const createJob = (fileId = 'file-1', nasObjectKey = '2025/01/test.txt') => ({
    id: 'job-1',
    queueName: CACHE_RESTORE_QUEUE,
    data: { fileId, nasObjectKey },
    status: 'active' as const,
    createdAt: new Date(),
  });

  // ═══════════════════════════════════════════════════════
  // 테스트 모듈 설정
  // ═══════════════════════════════════════════════════════
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheRestoreWorker,
        FileNasStorageDomainService,
        FileCacheStorageDomainService,
        { provide: JOB_QUEUE_PORT, useValue: mockJobQueue },
        { provide: DISTRIBUTED_LOCK_PORT, useValue: mockDistributedLock },
        { provide: CACHE_STORAGE_PORT, useValue: mockCacheStorage },
        { provide: NAS_STORAGE_PORT, useValue: mockNasStorage },
        { provide: FILE_STORAGE_OBJECT_REPOSITORY, useValue: mockFileStorageObjectRepository },
      ],
    }).compile();

    worker = module.get<CacheRestoreWorker>(CacheRestoreWorker);

    // processJobs 호출 시 processor 함수를 캡처
    mockJobQueue.processJobs.mockImplementation(
      (_queueName: string, processor: (job: any) => Promise<void>) => {
        processJobFn = processor;
        return Promise.resolve();
      },
    );

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════
  // 큐 등록 테스트
  // ═══════════════════════════════════════════════════════
  describe('onModuleInit', () => {
    it('CACHE_RESTORE 큐가 concurrency와 함께 등록되어야 한다', async () => {
      await worker.onModuleInit();

      expect(mockJobQueue.processJobs).toHaveBeenCalledWith(
        CACHE_RESTORE_QUEUE,
        expect.any(Function),
        expect.objectContaining({ concurrency: expect.any(Number) }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  // 멱등성 테스트
  // ═══════════════════════════════════════════════════════
  describe('멱등성 (Idempotency)', () => {
    beforeEach(async () => {
      await worker.onModuleInit();
    });

    it('캐시에 파일이 이미 존재하고 DB 상태가 AVAILABLE이면 스킵한다', async () => {
      // GIVEN
      const cacheObject = createCacheObject({ availabilityStatus: AvailabilityStatus.AVAILABLE });
      mockCacheStorage.파일존재확인.mockResolvedValue(true);
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue(cacheObject);

      // WHEN
      await processJobFn(createJob());

      // THEN: NAS에서 읽기 시도 없음
      expect(mockNasStorage.파일스트림읽기).not.toHaveBeenCalled();
      expect(mockCacheStorage.파일스트림쓰기).not.toHaveBeenCalled();
    });

    it('캐시 파일은 존재하지만 DB 상태가 MISSING이면 상태만 AVAILABLE로 보정한다', async () => {
      // GIVEN
      const cacheObject = createCacheObject({ availabilityStatus: AvailabilityStatus.MISSING });
      mockCacheStorage.파일존재확인.mockResolvedValue(true);
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue(cacheObject);

      // WHEN
      await processJobFn(createJob());

      // THEN: 파일 복사 없이 DB 상태만 보정
      expect(mockNasStorage.파일스트림읽기).not.toHaveBeenCalled();
      expect(mockFileStorageObjectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ availabilityStatus: AvailabilityStatus.AVAILABLE }),
        undefined,
      );
    });

    it('캐시 파일은 존재하지만 DB 레코드가 없으면 새로 생성한다', async () => {
      // GIVEN
      mockCacheStorage.파일존재확인.mockResolvedValue(true);
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue(null);

      // WHEN
      await processJobFn(createJob());

      // THEN: 파일 복사 없이 DB 레코드만 생성
      expect(mockNasStorage.파일스트림읽기).not.toHaveBeenCalled();
      expect(mockFileStorageObjectRepository.save).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════
  // NAS 상태 확인 테스트
  // ═══════════════════════════════════════════════════════
  describe('NAS 상태 확인', () => {
    beforeEach(async () => {
      await worker.onModuleInit();
      mockCacheStorage.파일존재확인.mockResolvedValue(false);
      mockFileStorageObjectRepository.findByFileIdAndType
        .mockImplementation((fileId: string, storageType: StorageType) => {
          if (storageType === StorageType.CACHE) return Promise.resolve(null);
          if (storageType === StorageType.NAS) return Promise.resolve(createNasObject());
          return Promise.resolve(null);
        });
    });

    it('NAS storage object가 없으면 복원을 중단한다', async () => {
      // GIVEN: CACHE 조회 시 null, NAS 조회 시도 null
      mockFileStorageObjectRepository.findByFileIdAndType.mockResolvedValue(null);

      // WHEN
      await processJobFn(createJob());

      // THEN: NAS 스트림 읽기 시도 없음
      expect(mockNasStorage.파일스트림읽기).not.toHaveBeenCalled();
    });

    it('NAS storage object가 SYNCING 상태이면 복원을 중단한다', async () => {
      // GIVEN
      const nasObject = createNasObject({ availabilityStatus: AvailabilityStatus.SYNCING });
      mockFileStorageObjectRepository.findByFileIdAndType
        .mockImplementation((fileId: string, storageType: StorageType) => {
          if (storageType === StorageType.CACHE) return Promise.resolve(null);
          if (storageType === StorageType.NAS) return Promise.resolve(nasObject);
          return Promise.resolve(null);
        });

      // WHEN
      await processJobFn(createJob());

      // THEN
      expect(mockNasStorage.파일스트림읽기).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════
  // 정상 복원 플로우 테스트
  // ═══════════════════════════════════════════════════════
  describe('정상 복원 플로우', () => {
    const nasObject = createNasObject();
    const mockStream = new Readable({ read() { this.push(null); } });

    beforeEach(async () => {
      await worker.onModuleInit();

      // 캐시에 파일 없음
      mockCacheStorage.파일존재확인.mockResolvedValue(false);
      // 캐시 DB 레코드 없음, NAS 레코드 AVAILABLE
      mockFileStorageObjectRepository.findByFileIdAndType
        .mockImplementation((fileId: string, storageType: StorageType) => {
          if (storageType === StorageType.CACHE) return Promise.resolve(null);
          if (storageType === StorageType.NAS) return Promise.resolve(nasObject);
          return Promise.resolve(null);
        });
      // NAS에서 스트림 반환
      mockNasStorage.파일스트림읽기.mockResolvedValue(mockStream);
      // 캐시 쓰기 성공
      mockCacheStorage.파일스트림쓰기.mockResolvedValue(undefined);
      // 사이즈 일치
      mockCacheStorage.파일크기조회.mockResolvedValue(1024);
      mockNasStorage.파일크기조회.mockResolvedValue(1024);
    });

    it('NAS에서 전체 파일을 읽어 캐시에 저장하고 DB 레코드를 생성한다', async () => {
      // WHEN
      await processJobFn(createJob());

      // THEN
      expect(mockNasStorage.파일스트림읽기).toHaveBeenCalledWith('2025/01/test.txt');
      expect(mockCacheStorage.파일스트림쓰기).toHaveBeenCalledWith('file-1', mockStream);
      expect(mockFileStorageObjectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-1',
          storageType: StorageType.CACHE,
          availabilityStatus: AvailabilityStatus.AVAILABLE,
        }),
        undefined,
      );
    });

    it('분산 락(cache-restore:{fileId})을 사용하여 동시 복원을 방지한다', async () => {
      // WHEN
      await processJobFn(createJob());

      // THEN
      expect(mockDistributedLock.withLock).toHaveBeenCalledWith(
        'cache-restore:file-1',
        expect.any(Function),
        expect.objectContaining({ ttl: 120000, waitTimeout: 5000 }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  // 파일 무결성 검증 테스트
  // ═══════════════════════════════════════════════════════
  describe('파일 무결성 검증', () => {
    const nasObject = createNasObject();
    const mockStream = new Readable({ read() { this.push(null); } });

    beforeEach(async () => {
      await worker.onModuleInit();
      mockCacheStorage.파일존재확인.mockResolvedValue(false);
      mockFileStorageObjectRepository.findByFileIdAndType
        .mockImplementation((fileId: string, storageType: StorageType) => {
          if (storageType === StorageType.CACHE) return Promise.resolve(null);
          if (storageType === StorageType.NAS) return Promise.resolve(nasObject);
          return Promise.resolve(null);
        });
      mockNasStorage.파일스트림읽기.mockResolvedValue(mockStream);
      mockCacheStorage.파일스트림쓰기.mockResolvedValue(undefined);
    });

    it('캐시 파일 크기와 NAS 파일 크기가 불일치하면 에러를 발생시킨다', async () => {
      // GIVEN: 사이즈 불일치
      mockCacheStorage.파일크기조회.mockResolvedValue(512);
      mockNasStorage.파일크기조회.mockResolvedValue(1024);

      // WHEN & THEN
      await expect(processJobFn(createJob())).rejects.toThrow('size mismatch');

      // 불일치 파일이 삭제되어야 함
      expect(mockCacheStorage.파일삭제).toHaveBeenCalledWith('file-1');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 에러 처리 테스트
  // ═══════════════════════════════════════════════════════
  describe('에러 처리', () => {
    const nasObject = createNasObject();
    const cacheObject = createCacheObject({ availabilityStatus: AvailabilityStatus.MISSING });

    beforeEach(async () => {
      await worker.onModuleInit();
      mockCacheStorage.파일존재확인.mockResolvedValue(false);
      mockFileStorageObjectRepository.findByFileIdAndType
        .mockImplementation((fileId: string, storageType: StorageType) => {
          if (storageType === StorageType.CACHE) return Promise.resolve(cacheObject);
          if (storageType === StorageType.NAS) return Promise.resolve(nasObject);
          return Promise.resolve(null);
        });
    });

    it('NAS 스트림 읽기 실패 시 기존 캐시 객체를 MISSING으로 마킹한다', async () => {
      // GIVEN
      mockNasStorage.파일스트림읽기.mockRejectedValue(new Error('NAS read error'));

      // WHEN & THEN
      await expect(processJobFn(createJob())).rejects.toThrow('NAS read error');

      expect(mockFileStorageObjectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ availabilityStatus: AvailabilityStatus.MISSING }),
        undefined,
      );
    });

    it('캐시 쓰기 실패 시 불완전 파일 정리를 시도한다', async () => {
      // GIVEN
      const mockStream = new Readable({ read() { this.push(null); } });
      mockNasStorage.파일스트림읽기.mockResolvedValue(mockStream);
      mockCacheStorage.파일스트림쓰기.mockRejectedValue(new Error('Cache write error'));
      mockCacheStorage.파일존재확인
        .mockResolvedValueOnce(false)  // 첫 호출: 복원 전 체크
        .mockResolvedValueOnce(true);  // 두 번째 호출: 정리 시 체크

      // WHEN & THEN
      await expect(processJobFn(createJob())).rejects.toThrow('Cache write error');

      // 불완전 파일 삭제 시도
      expect(mockCacheStorage.파일삭제).toHaveBeenCalledWith('file-1');
    });
  });
});
