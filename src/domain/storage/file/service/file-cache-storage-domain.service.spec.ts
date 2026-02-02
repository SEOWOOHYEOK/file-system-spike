/**
 * ============================================================
 * 파일 캐시 스토리지 도메인 서비스 테스트
 * ============================================================
 *
 * 테스트 대상:
 *   - FileCacheStorageDomainService.조회및파일확인
 *
 * 비즈니스 맥락:
 *   - DB 레코드와 실제 파일 시스템 간 일관성 보장
 *   - 캐시 파일이 없는 경우 상태를 MISSING으로 갱신
 * ============================================================
 */

import { FileCacheStorageDomainService } from './file-cache-storage-domain.service';
import {
  FileStorageObjectEntity,
  StorageType,
  AvailabilityStatus,
} from '../entity/file-storage-object.entity';

describe('FileCacheStorageDomainService', () => {
  /**
   * Mock 설정
   */
  const mockRepository = {
    findByFileIdAndType: jest.fn(),
    save: jest.fn(),
  };

  const mockCacheStorage = {
    파일존재확인: jest.fn(),
  };

  let service: FileCacheStorageDomainService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileCacheStorageDomainService(
      mockRepository as any,
      mockCacheStorage as any,
    );
  });

  describe('조회및파일확인', () => {
    /**
     * 테스트 시나리오: DB에 캐시 레코드가 없는 경우
     *
     * 기대 결과:
     *   - null 반환
     */
    it('DB에 캐시 레코드가 없으면 null을 반환해야 한다', async () => {
      // GIVEN
      mockRepository.findByFileIdAndType.mockResolvedValue(null);

      // WHEN
      const result = await service.조회및파일확인('file-1');

      // THEN
      expect(result).toBeNull();
      expect(mockCacheStorage.파일존재확인).not.toHaveBeenCalled();
    });

    /**
     * 테스트 시나리오: DB 레코드가 AVAILABLE이 아닌 경우
     *
     * 기대 결과:
     *   - null 반환, 파일 존재 확인 호출 안함
     */
    it('캐시 상태가 MISSING이면 null을 반환해야 한다', async () => {
      // GIVEN
      const cacheObject = new FileStorageObjectEntity({
        id: 'cache-1',
        fileId: 'file-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/file-1',
        availabilityStatus: AvailabilityStatus.MISSING,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      mockRepository.findByFileIdAndType.mockResolvedValue(cacheObject);

      // WHEN
      const result = await service.조회및파일확인('file-1');

      // THEN
      expect(result).toBeNull();
      expect(mockCacheStorage.파일존재확인).not.toHaveBeenCalled();
    });

    /**
     * 테스트 시나리오: DB 레코드가 SYNCING인 경우
     *
     * 기대 결과:
     *   - null 반환
     */
    it('캐시 상태가 SYNCING이면 null을 반환해야 한다', async () => {
      // GIVEN
      const cacheObject = new FileStorageObjectEntity({
        id: 'cache-1',
        fileId: 'file-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/file-1',
        availabilityStatus: AvailabilityStatus.SYNCING,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      mockRepository.findByFileIdAndType.mockResolvedValue(cacheObject);

      // WHEN
      const result = await service.조회및파일확인('file-1');

      // THEN
      expect(result).toBeNull();
      expect(mockCacheStorage.파일존재확인).not.toHaveBeenCalled();
    });

    /**
     * 테스트 시나리오: DB 레코드가 AVAILABLE이고 실제 파일이 존재하는 경우
     *
     * 기대 결과:
     *   - 캐시 객체 반환
     */
    it('AVAILABLE 상태이고 실제 파일이 존재하면 캐시 객체를 반환해야 한다', async () => {
      // GIVEN
      const cacheObject = new FileStorageObjectEntity({
        id: 'cache-1',
        fileId: 'file-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/file-1',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      mockRepository.findByFileIdAndType.mockResolvedValue(cacheObject);
      mockCacheStorage.파일존재확인.mockResolvedValue(true);

      // WHEN
      const result = await service.조회및파일확인('file-1');

      
      // THEN
      expect(result).toBe(cacheObject);
      expect(mockCacheStorage.파일존재확인).toHaveBeenCalledWith('cache/file-1');
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    /**
     * 테스트 시나리오: DB 레코드가 AVAILABLE이지만 실제 파일이 없는 경우
     *
     * 기대 결과:
     *   - null 반환
     *   - 상태를 MISSING으로 갱신
     */
    it('AVAILABLE 상태지만 실제 파일이 없으면 MISSING으로 갱신하고 null을 반환해야 한다', async () => {
      // GIVEN
      const cacheObject = new FileStorageObjectEntity({
        id: 'cache-1',
        fileId: 'file-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/file-1',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      mockRepository.findByFileIdAndType.mockResolvedValue(cacheObject);
      mockCacheStorage.파일존재확인.mockResolvedValue(false);
      mockRepository.save.mockResolvedValue(cacheObject);

      // WHEN
      const result = await service.조회및파일확인('file-1');

      // THEN
      expect(result).toBeNull();
      expect(mockCacheStorage.파일존재확인).toHaveBeenCalledWith('cache/file-1');
      expect(mockRepository.save).toHaveBeenCalled();
      expect(cacheObject.availabilityStatus).toBe(AvailabilityStatus.MISSING);
    });

    /**
     * 테스트 시나리오: DB 레코드가 EVICTING인 경우
     *
     * 기대 결과:
     *   - null 반환 (eviction 진행 중이므로 사용 불가)
     */
    it('캐시 상태가 EVICTING이면 null을 반환해야 한다', async () => {
      // GIVEN
      const cacheObject = new FileStorageObjectEntity({
        id: 'cache-1',
        fileId: 'file-1',
        storageType: StorageType.CACHE,
        objectKey: 'cache/file-1',
        availabilityStatus: AvailabilityStatus.EVICTING,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      mockRepository.findByFileIdAndType.mockResolvedValue(cacheObject);

      // WHEN
      const result = await service.조회및파일확인('file-1');

      // THEN
      expect(result).toBeNull();
      expect(mockCacheStorage.파일존재확인).not.toHaveBeenCalled();
    });
  });
});
