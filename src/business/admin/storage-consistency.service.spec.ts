/**
 * ============================================================
 * 📦 Admin Storage Consistency 도메인 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - AdminStorageConsistencyDomainService
 *
 * 📋 비즈니스 맥락:
 *   - DB와 실제 스토리지 간의 일관성을 검증
 *   - DB에만 있고 스토리지에 없는 파일 (DB_ONLY) 감지
 *   - DB 크기와 실제 파일 크기 불일치 (SIZE_MISMATCH) 감지
 *   - 샘플링 조회로 대량 파일 효율적 검증 지원
 *
 * ⚠️ 중요 고려사항:
 *   - Cache와 NAS 스토리지 각각 검증 가능
 *   - 페이징/샘플링으로 대용량 데이터 처리
 *   - 스토리지 접근 오류 시에도 결과 반환 (에러를 이슈로 기록)
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { StorageConsistencyService } from './storage-consistency.service';
import {
  FILE_REPOSITORY,
  IFileRepository,
} from '../../domain/file/repositories/file.repository.interface';
import {
  FILE_STORAGE_OBJECT_REPOSITORY,
  IFileStorageObjectRepository,
} from '../../domain/storage/file/repositories/file-storage-object.repository.interface';
import {
  CACHE_STORAGE_PORT,
  ICacheStoragePort,
} from '../../domain/storage/ports/cache-storage.port';
import {
  NAS_STORAGE_PORT,
  INasStoragePort,
} from '../../domain/storage/ports/nas-storage.port';
import {
  StorageType,
  FileStorageObjectEntity,
  AvailabilityStatus,
} from '../../domain/storage/file/entity/file-storage-object.entity';
import { FileEntity, FileState } from '../../domain/file/entities/file.entity';

describe('StorageConsistencyService', () => {
  let service: StorageConsistencyService;
  let storageObjectRepo: jest.Mocked<IFileStorageObjectRepository>;
  let fileRepo: jest.Mocked<IFileRepository>;
  let cacheStorage: jest.Mocked<ICacheStoragePort>;
  let nasStorage: jest.Mocked<INasStoragePort>;

  /**
   * 🎭 Mock 설정
   * 📍 storageObjectRepo.findByStorageType:
   *   - 실제 동작: 스토리지 타입별로 DB에서 스토리지 객체 조회
   *   - Mock 이유: 실제 DB 연결 없이 다양한 시나리오 테스트
   *
   * 📍 fileRepo.findById:
   *   - 실제 동작: 파일 ID로 파일 메타데이터 조회
   *   - Mock 이유: DB 연결 없이 파일 정보 시뮬레이션
   *
   * 📍 cacheStorage.파일존재확인 / nasStorage.존재확인:
   *   - 실제 동작: 실제 스토리지에서 파일 존재 여부 확인
   *   - Mock 이유: 스토리지 연결 없이 존재/부재 시뮬레이션
   */
  beforeEach(async () => {
    storageObjectRepo = {
      findByStorageType: jest.fn(),
      findRandomSamples: jest.fn(),
      countByStorageType: jest.fn(),
      findByFileId: jest.fn(),
    } as any;

    fileRepo = {
      findById: jest.fn(),
    } as any;

    cacheStorage = {
      파일존재확인: jest.fn(),
      파일크기조회: jest.fn(),
    } as any;

    nasStorage = {
      존재확인: jest.fn(),
      파일크기조회: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageConsistencyService,
        {
          provide: FILE_STORAGE_OBJECT_REPOSITORY,
          useValue: storageObjectRepo,
        },
        {
          provide: FILE_REPOSITORY,
          useValue: fileRepo,
        },
        {
          provide: CACHE_STORAGE_PORT,
          useValue: cacheStorage,
        },
        {
          provide: NAS_STORAGE_PORT,
          useValue: nasStorage,
        },
      ],
    }).compile();

    service = module.get<StorageConsistencyService>(
      StorageConsistencyService,
    );
  });

  describe('checkConsistency', () => {
    /**
     * 📌 테스트 시나리오: DB_ONLY 이슈 감지 - 파일이 스토리지에 없음
     *
     * 🎯 검증 목적:
     *   DB에는 스토리지 객체 레코드가 있지만 실제 스토리지에 파일이 없는 경우를 감지해야 한다.
     *   이는 파일 손실이나 동기화 실패를 나타내는 심각한 문제이다.
     *
     * ✅ 기대 결과:
     *   - issues 배열에 DB_ONLY 타입의 이슈가 포함됨
     *   - 이슈에 fileId, fileName, storageType 정보 포함
     */
    it('should detect DB_ONLY issue when file does not exist in storage', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const storageObject = new FileStorageObjectEntity({
        id: 'storage-id-1',
        fileId: 'file-id-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/path/to/file.pdf',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });

      const file = new FileEntity({
        id: 'file-id-1',
        name: 'test.pdf',
        folderId: 'folder-id-1',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      storageObjectRepo.findByStorageType.mockResolvedValue([storageObject]);
      fileRepo.findById.mockResolvedValue(file);
      cacheStorage.파일존재확인.mockResolvedValue(false);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: false,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].issueType).toBe('DB_ONLY');
      expect(result.issues[0].fileId).toBe('file-id-1');
      expect(result.issues[0].fileName).toBe('test.pdf');
      expect(result.issues[0].storageType).toBe(StorageType.CACHE);
    });

    /**
     * 📌 테스트 시나리오: SIZE_MISMATCH 이슈 감지 - 크기 불일치
     *
     * 🎯 검증 목적:
     *   DB에 기록된 파일 크기와 실제 스토리지의 파일 크기가 다른 경우를 감지해야 한다.
     *   이는 데이터 무결성 문제나 불완전한 업로드를 나타낼 수 있다.
     *
     * ✅ 기대 결과:
     *   - issues 배열에 SIZE_MISMATCH 타입의 이슈가 포함됨
     *   - dbSize와 actualSize 정보 포함
     */
    it('should detect SIZE_MISMATCH when file sizes differ', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const storageObject = new FileStorageObjectEntity({
        id: 'storage-id-1',
        fileId: 'file-id-1',
        storageType: StorageType.NAS,
        objectKey: 'nas/path/to/file.pdf',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });

      const file = new FileEntity({
        id: 'file-id-1',
        name: 'test.pdf',
        folderId: 'folder-id-1',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      storageObjectRepo.findByStorageType.mockResolvedValue([storageObject]);
      fileRepo.findById.mockResolvedValue(file);
      nasStorage.존재확인.mockResolvedValue(true);
      nasStorage.파일크기조회.mockResolvedValue(2048); // DB의 1024와 다름

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkConsistency({
        storageType: StorageType.NAS,
        limit: 100,
        offset: 0,
        sample: false,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].issueType).toBe('SIZE_MISMATCH');
      expect(result.issues[0].dbSize).toBe(1024);
      expect(result.issues[0].actualSize).toBe(2048);
    });

    /**
     * 📌 테스트 시나리오: 샘플링 조회 사용
     *
     * 🎯 검증 목적:
     *   sample=true일 때 findRandomSamples를 사용해야 한다.
     *   대용량 데이터에서 효율적인 일관성 검증을 위해 사용된다.
     *
     * ✅ 기대 결과:
     *   - findRandomSamples가 호출됨
     *   - findByStorageType은 호출되지 않음
     */
    it('should use sampling when sample=true', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      storageObjectRepo.findRandomSamples.mockResolvedValue([]);
      storageObjectRepo.countByStorageType.mockResolvedValue(1000);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.checkConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: true,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(storageObjectRepo.findRandomSamples).toHaveBeenCalledWith(
        StorageType.CACHE,
        100,
      );
      expect(storageObjectRepo.findByStorageType).not.toHaveBeenCalled();
    });

    /**
     * 📌 테스트 시나리오: 정상 흐름 - 일관성 문제 없음
     *
     * 🎯 검증 목적:
     *   모든 파일이 DB와 스토리지에서 일치하면 이슈가 없어야 한다.
     *
     * ✅ 기대 결과:
     *   - issues 배열이 비어있음
     *   - totalChecked가 검사한 파일 수와 일치
     */
    it('should return no issues when all files are consistent', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const storageObject = new FileStorageObjectEntity({
        id: 'storage-id-1',
        fileId: 'file-id-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/path/to/file.pdf',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });

      const file = new FileEntity({
        id: 'file-id-1',
        name: 'test.pdf',
        folderId: 'folder-id-1',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      storageObjectRepo.findByStorageType.mockResolvedValue([storageObject]);
      fileRepo.findById.mockResolvedValue(file);
      cacheStorage.파일존재확인.mockResolvedValue(true);
      cacheStorage.파일크기조회.mockResolvedValue(1024); // DB와 일치

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: false,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.issues).toHaveLength(0);
      expect(result.totalChecked).toBe(1);
      expect(result.inconsistencies).toBe(0);
    });

    /**
     * 📌 테스트 시나리오: ORPHAN 이슈 감지 - DB에 파일 레코드 없음
     *
     * 🎯 검증 목적:
     *   스토리지 객체는 있지만 연결된 파일 레코드가 없는 경우를 감지해야 한다.
     *   이는 파일 삭제 후 스토리지 정리가 안 된 상황을 나타낸다.
     *
     * ✅ 기대 결과:
     *   - issues 배열에 ORPHAN 타입의 이슈가 포함됨
     */
    it('should detect ORPHAN issue when file record does not exist in DB', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const storageObject = new FileStorageObjectEntity({
        id: 'storage-id-1',
        fileId: 'file-id-orphan',
        storageType: StorageType.CACHE,
        objectKey: 'cache/path/to/orphan.pdf',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });

      storageObjectRepo.findByStorageType.mockResolvedValue([storageObject]);
      fileRepo.findById.mockResolvedValue(null); // 파일 레코드 없음

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: false,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].issueType).toBe('ORPHAN');
      expect(result.issues[0].fileId).toBe('file-id-orphan');
    });

    /**
     * 📌 테스트 시나리오: 스토리지 접근 오류 처리
     *
     * 🎯 검증 목적:
     *   스토리지 접근 중 오류가 발생해도 서비스가 중단되지 않고
     *   해당 파일을 ERROR 이슈로 기록해야 한다.
     *
     * ✅ 기대 결과:
     *   - issues 배열에 ERROR 타입의 이슈가 포함됨
     *   - 에러 메시지가 description에 포함됨
     */
    it('should handle storage access errors gracefully', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const storageObject = new FileStorageObjectEntity({
        id: 'storage-id-1',
        fileId: 'file-id-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/path/to/file.pdf',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });

      const file = new FileEntity({
        id: 'file-id-1',
        name: 'test.pdf',
        folderId: 'folder-id-1',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      storageObjectRepo.findByStorageType.mockResolvedValue([storageObject]);
      fileRepo.findById.mockResolvedValue(file);
      cacheStorage.파일존재확인.mockRejectedValue(new Error('Storage connection failed'));

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.checkConsistency({
        storageType: StorageType.CACHE,
        limit: 100,
        offset: 0,
        sample: false,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].issueType).toBe('ERROR');
      expect(result.issues[0].description).toContain('Storage connection failed');
    });
  });
});
