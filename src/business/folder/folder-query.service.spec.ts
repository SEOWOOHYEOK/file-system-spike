/**
 * ============================================================
 * 📦 폴더 조회 서비스 테스트 (FolderQueryService)
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FolderQueryService.getFolderInfo (폴더 정보 조회)
 *   - FolderQueryService.getFolderContents (폴더 내용 조회)
 *   - FolderQueryService.getBreadcrumbs (브레드크럼 조회)
 *
 * 📋 비즈니스 맥락:
 *   - 008-1.폴더_처리_FLOW.md 문서의 FLOW 2-1, 2-2 검증
 *   - 폴더 존재 확인, TRASHED 상태 체크
 *   - 브레드크럼(상위 폴더 체인), 페이지네이션 처리
 *
 * ⚠️ 중요 고려사항:
 *   - TRASHED 상태의 폴더는 조회 불가
 *   - 정렬 및 페이지네이션 정확성
 *   - 스토리지 상태 포함
 * ============================================================
 */

import { FolderQueryService } from './folder-query.service';
import {
  FolderEntity,
  FolderState,
  SortBy,
  SortOrder,
} from '../../domain/folder';
import { FolderStorageObjectEntity, FolderAvailabilityStatus } from '../../domain/storage/folder/folder-storage-object.entity';
import { FileState, StorageType } from '../../domain/file';
import { FileStorageObjectEntity, AvailabilityStatus } from '../../domain/storage/file/file-storage-object.entity';
import { NotFoundException } from '@nestjs/common';

describe('FolderQueryService', () => {
  /**
   * 🎭 Mock 설정
   * 📍 mockFolderRepository:
   *   - 실제 동작: 폴더 조회
   *   - Mock 이유: DB 연결 없이 비즈니스 로직만 검증하기 위함
   *
   * 📍 mockFileRepository:
   *   - 실제 동작: 파일 조회
   *   - Mock 이유: 폴더 내용 조회 시 파일 목록 시뮬레이션
   */
  const mockFolderRepository = {
    findById: jest.fn(),
    findOne: jest.fn(),
    findByParentId: jest.fn(),
    findAncestors: jest.fn(),
    getStatistics: jest.fn(),
  };

  const mockFolderStorageObjectRepository = {
    findByFolderId: jest.fn(),
  };

  const mockFileRepository = {
    findByFolderId: jest.fn(),
  };

  const mockFileStorageObjectRepository = {
    findByFileId: jest.fn(),
  };

  let service: FolderQueryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FolderQueryService(
      mockFolderRepository as any,
      mockFolderStorageObjectRepository as any,
      mockFileRepository as any,
      mockFileStorageObjectRepository as any,
    );
  });

  // =================================================================
  // 📁 1. 폴더 정보 조회 (GET /folders/{folderId}) 플로우 테스트
  // =================================================================
  describe('폴더 정보 조회 (getFolderInfo)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 폴더 정보 조회
     *
     * 🎯 검증 목적:
     *   - FLOW 2-1 정상 흐름 검증
     *   - 폴더 정보, 스토리지 상태, 통계 정보 반환
     *
     * ✅ 기대 결과:
     *   - 폴더 정보가 정상적으로 반환됨
     */
    it('존재하는 폴더 조회 시 폴더 정보, 스토리지 상태, 통계가 반환되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'test-folder',
        parentId: 'parent-id',
        path: '/parent/test-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/test-folder',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      const statistics = {
        fileCount: 10,
        folderCount: 5,
        totalSize: 1024000,
      };

      mockFolderRepository.findById.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.getStatistics.mockResolvedValue(statistics);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getFolderInfo('folder-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toEqual({
        id: 'folder-1',
        name: 'test-folder',
        parentId: 'parent-id',
        path: '/parent/test-folder',
        state: FolderState.ACTIVE,
        storageStatus: {
          nas: FolderAvailabilityStatus.AVAILABLE,
        },
        fileCount: 10,
        folderCount: 5,
        totalSize: 1024000,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    /**
     * 📌 테스트 시나리오: 존재하지 않는 폴더 조회
     *
     * 🎯 검증 목적:
     *   - FLOW 2-1: 폴더가 없을 때 에러 반환
     *
     * ✅ 기대 결과:
     *   - 404 FOLDER_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 폴더 조회 시 404 FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFolderRepository.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.getFolderInfo('non-existent-folder')).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * 📌 테스트 시나리오: 스토리지 객체가 없는 폴더 조회
     *
     * 🎯 검증 목적:
     *   - 스토리지 객체가 없어도 폴더 정보는 반환되어야 함
     *
     * ✅ 기대 결과:
     *   - storageStatus.nas가 null로 반환됨
     */
    it('스토리지 객체가 없는 폴더 조회 시 storageStatus.nas가 null이어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'test-folder',
        parentId: null,
        path: '/test-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(null);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getFolderInfo('folder-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.storageStatus.nas).toBeNull();
    });
  });

  // =================================================================
  // 📁 2. 폴더 내용 조회 (GET /folders/{folderId}/contents) 플로우 테스트
  // =================================================================
  describe('폴더 내용 조회 (getFolderContents)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 폴더 내용 조회
     *
     * 🎯 검증 목적:
     *   - FLOW 2-2 정상 흐름 검증
     *   - 브레드크럼, 하위 폴더, 파일 목록, 페이지네이션 반환
     *
     * ✅ 기대 결과:
     *   - 모든 구성 요소가 정상적으로 반환됨
     */
    it('정상적인 폴더 내용 조회 시 브레드크럼, 폴더, 파일 목록이 반환되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'test-folder',
        parentId: 'parent-id',
        path: '/parent/test-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const ancestors = [
        new FolderEntity({
          id: 'root-id',
          name: '',
          parentId: null,
          path: '/',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        new FolderEntity({
          id: 'parent-id',
          name: 'parent',
          parentId: 'root-id',
          path: '/parent',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      const subFolders = [
        new FolderEntity({
          id: 'sub-folder-1',
          name: 'sub-folder',
          parentId: 'folder-1',
          path: '/parent/test-folder/sub-folder',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      const files = [
        {
          id: 'file-1',
          name: 'test-file.txt',
          folderId: 'folder-1',
          sizeBytes: 1024,
          mimeType: 'text/plain',
          state: FileState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const folderStorageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'sub-folder-1',
        storageType: 'NAS',
        objectKey: '/parent/test-folder/sub-folder',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      const fileStorageObjects = [
        new FileStorageObjectEntity({
          id: 'file-storage-1',
          fileId: 'file-1',
          storageType: StorageType.NAS,
          objectKey: 'test-file.txt',
          availabilityStatus: AvailabilityStatus.AVAILABLE,
          accessCount: 0,
          leaseCount: 0,
          createdAt: new Date(),
        }),
      ];

      mockFolderRepository.findById.mockResolvedValue(folder);
      mockFolderRepository.findAncestors.mockResolvedValue(ancestors);
      mockFolderRepository.findByParentId.mockResolvedValue(subFolders);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(folderStorageObject);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
      });
      mockFileRepository.findByFolderId.mockResolvedValue(files);
      mockFileStorageObjectRepository.findByFileId.mockResolvedValue(fileStorageObjects);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getFolderContents('folder-1', {});

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.folderId).toBe('folder-1');
      expect(result.path).toBe('/parent/test-folder');
      expect(result.breadcrumbs).toHaveLength(2);
      expect(result.folders).toHaveLength(1);
      expect(result.files).toHaveLength(1);
      expect(result.pagination).toBeDefined();
    });

    /**
     * 📌 테스트 시나리오: TRASHED 상태의 폴더 내용 조회
     *
     * 🎯 검증 목적:
     *   - FLOW 2-2: TRASHED 상태의 폴더는 조회 불가
     *
     * ✅ 기대 결과:
     *   - 404 FOLDER_NOT_FOUND 에러 발생
     */
    it('TRASHED 상태의 폴더 내용 조회 시 404 FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const trashedFolder = new FolderEntity({
        id: 'folder-1',
        name: 'trashed-folder',
        parentId: 'parent-id',
        path: '/parent/trashed-folder',
        state: FolderState.TRASHED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(trashedFolder);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.getFolderContents('folder-1', {})).rejects.toThrow(NotFoundException);
    });

    /**
     * 📌 테스트 시나리오: 페이지네이션 적용
     *
     * 🎯 검증 목적:
     *   - 페이지네이션이 정확하게 적용되는지 확인
     *
     * ✅ 기대 결과:
     *   - 지정된 페이지와 페이지 크기에 맞게 결과가 반환됨
     */
    it('페이지네이션이 정확하게 적용되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'test-folder',
        parentId: null,
        path: '/test-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 10개의 하위 폴더 생성
      const subFolders = Array.from({ length: 10 }, (_, i) =>
        new FolderEntity({
          id: `sub-folder-${i}`,
          name: `sub-folder-${i}`,
          parentId: 'folder-1',
          path: `/test-folder/sub-folder-${i}`,
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      mockFolderRepository.findById.mockResolvedValue(folder);
      mockFolderRepository.findAncestors.mockResolvedValue([]);
      mockFolderRepository.findByParentId.mockResolvedValue(subFolders);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(null);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
      });
      mockFileRepository.findByFolderId.mockResolvedValue([]);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getFolderContents('folder-1', {
        page: 1,
        pageSize: 5,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.folders).toHaveLength(5);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(5);
      expect(result.pagination.totalItems).toBe(10);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });

    /**
     * 📌 테스트 시나리오: 정렬 적용 (이름 기준 내림차순)
     *
     * 🎯 검증 목적:
     *   - 정렬이 정확하게 적용되는지 확인
     *
     * ✅ 기대 결과:
     *   - 지정된 정렬 기준에 맞게 결과가 정렬됨
     */
    it('정렬이 정확하게 적용되어야 한다 (이름 기준 내림차순)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'test-folder',
        parentId: null,
        path: '/test-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const subFolders = [
        new FolderEntity({
          id: 'sub-1',
          name: 'alpha',
          parentId: 'folder-1',
          path: '/test-folder/alpha',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        new FolderEntity({
          id: 'sub-2',
          name: 'zeta',
          parentId: 'folder-1',
          path: '/test-folder/zeta',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        new FolderEntity({
          id: 'sub-3',
          name: 'beta',
          parentId: 'folder-1',
          path: '/test-folder/beta',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockFolderRepository.findById.mockResolvedValue(folder);
      mockFolderRepository.findAncestors.mockResolvedValue([]);
      mockFolderRepository.findByParentId.mockResolvedValue(subFolders);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(null);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
      });
      mockFileRepository.findByFolderId.mockResolvedValue([]);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getFolderContents('folder-1', {
        sortBy: SortBy.NAME,
        sortOrder: SortOrder.DESC,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.folders[0].name).toBe('zeta');
      expect(result.folders[1].name).toBe('beta');
      expect(result.folders[2].name).toBe('alpha');
    });
  });

  // =================================================================
  // 📁 3. 브레드크럼 조회 테스트
  // =================================================================
  describe('브레드크럼 조회 (getBreadcrumbs)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 브레드크럼 조회
     *
     * 🎯 검증 목적:
     *   - FLOW 2-2 step 2: 브레드크럼 (recursive CTE) 조회
     *   - 상위 폴더 체인이 정확하게 반환되는지 확인
     *
     * ✅ 기대 결과:
     *   - 루트부터 현재 폴더까지의 경로가 순서대로 반환됨
     */
    it('브레드크럼이 정확하게 반환되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const ancestors = [
        new FolderEntity({
          id: 'root-id',
          name: '',
          parentId: null,
          path: '/',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        new FolderEntity({
          id: 'parent-id',
          name: 'parent',
          parentId: 'root-id',
          path: '/parent',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        new FolderEntity({
          id: 'folder-1',
          name: 'current',
          parentId: 'parent-id',
          path: '/parent/current',
          state: FolderState.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ];

      mockFolderRepository.findAncestors.mockResolvedValue(ancestors);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getBreadcrumbs('folder-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('root-id');
      expect(result[1].id).toBe('parent-id');
      expect(result[2].id).toBe('folder-1');
    });
  });

  // =================================================================
  // 📁 4. 루트 폴더 조회 테스트
  // =================================================================
  describe('루트 폴더 조회 (getRootFolderInfo)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 루트 폴더 조회
     *
     * 🎯 검증 목적:
     *   - 루트 폴더 정보가 정상적으로 반환되는지 확인
     *
     * ✅ 기대 결과:
     *   - 루트 폴더 정보가 반환됨
     */
    it('루트 폴더 정보가 정상적으로 반환되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const rootFolder = new FolderEntity({
        id: 'root-id',
        name: '',
        parentId: null,
        path: '/',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'root-id',
        storageType: 'NAS',
        objectKey: '/',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findOne.mockResolvedValue(rootFolder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 100,
        folderCount: 20,
        totalSize: 1024000000,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.getRootFolderInfo();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.id).toBe('root-id');
      expect(result.path).toBe('/');
      expect(result.parentId).toBeNull();
      expect(result.fileCount).toBe(100);
      expect(result.folderCount).toBe(20);
    });

    /**
     * 📌 테스트 시나리오: 루트 폴더가 존재하지 않음
     *
     * 🎯 검증 목적:
     *   - 루트 폴더가 없을 때 에러 반환
     *
     * ✅ 기대 결과:
     *   - 404 ROOT_FOLDER_NOT_FOUND 에러 발생
     */
    it('루트 폴더가 존재하지 않을 때 404 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFolderRepository.findOne.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.getRootFolderInfo()).rejects.toThrow(NotFoundException);
    });
  });
});
