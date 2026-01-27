/**
 * ============================================================
 * 📦 폴더 명령 서비스 테스트 (FolderCommandService)
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FolderCommandService.생성 (폴더 생성)
 *   - FolderCommandService.이름변경 (폴더명 변경)
 *   - FolderCommandService.이동 (폴더 이동)
 *   - FolderCommandService.delete (폴더 삭제 - 휴지통 이동)
 *
 * 📋 비즈니스 맥락:
 *   - 008-1.폴더_처리_FLOW.md 문서에 정의된 플로우 검증
 *   - 폴더명 유효성 검사, 중복 체크, 순환 이동 방지
 *   - 빈 폴더만 삭제 가능 정책 (중요!)
 *   - NAS 동기화 상태 확인 후 작업 수행
 *
 * ⚠️ 중요 고려사항:
 *   - 트랜잭션 처리: BEGIN → 작업 → COMMIT/ROLLBACK
 *   - FOR UPDATE 락을 통한 동시성 제어
 *   - Bull Queue를 통한 비동기 NAS 동기화
 *   - 정책: 빈 폴더만 삭제 가능 (하위 파일/폴더가 있으면 삭제 불가)
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { FolderCommandService } from './folder-command.service';
import {
  FolderEntity,
  FolderState,
  FolderConflictStrategy,
  MoveFolderConflictStrategy,
} from '../../domain/folder';
import { FolderStorageObjectEntity, FolderAvailabilityStatus } from '../../domain/storage/folder/folder-storage-object.entity';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('FolderCommandService', () => {
  /**
   * 🎭 Mock 설정
   * 📍 mockFolderRepository:
   *   - 실제 동작: 폴더 CRUD 및 조회
   *   - Mock 이유: DB 연결 없이 비즈니스 로직만 검증하기 위함
   *
   * 📍 mockFolderStorageObjectRepository:
   *   - 실제 동작: NAS 스토리지 상태 관리
   *   - Mock 이유: 스토리지 동기화 상태 시뮬레이션
   */
  const mockFolderRepository = {
    findById: jest.fn(),
    findByIdForUpdate: jest.fn(),
    findOne: jest.fn(),
    findByParentId: jest.fn(),
    existsByNameInParent: jest.fn(),
    save: jest.fn(),
    updatePathByPrefix: jest.fn(),
    getStatistics: jest.fn(),
  };

  const mockFolderStorageObjectRepository = {
    findByFolderId: jest.fn(),
    findByFolderIdForUpdate: jest.fn(),
    save: jest.fn(),
  };

  const mockFileRepository = {
    findByFolderId: jest.fn(),
    countByFolderId: jest.fn(),
  };

  const mockFileStorageObjectRepository = {
    findByFileId: jest.fn(),
  };

  const mockTrashRepository = {
    save: jest.fn(),
  };

  const mockJobQueue = {
    addJob: jest.fn(),
  };

  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };

  let service: FolderCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FolderCommandService(
      mockDataSource as any,
      mockFolderRepository as any,
      mockFolderStorageObjectRepository as any,
      mockFileRepository as any,
      mockFileStorageObjectRepository as any,
      mockTrashRepository as any,
      mockJobQueue as any,
    );
  });

  // =================================================================
  // 📁 1. 폴더 생성 (POST /folders) 플로우 테스트
  // =================================================================
  describe('폴더 생성 (생성)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 폴더 생성
     *
     * 🎯 검증 목적:
     *   - FLOW 1-1 정상 흐름 검증
     *   - 폴더 생성 후 NAS_SYNC_MKDIR 작업이 큐에 추가되는지 확인
     *
     * ✅ 기대 결과:
     *   - 폴더가 생성되고 storageStatus가 SYNCING
     */
    it('정상적인 폴더 생성 시 폴더가 생성되고 NAS 동기화 작업이 큐에 추가되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const parentFolder = new FolderEntity({
        id: 'parent-folder-id',
        name: 'parent',
        parentId: null,
        path: '/',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(parentFolder);
      mockFolderRepository.existsByNameInParent.mockResolvedValue(false);
      mockFolderRepository.save.mockResolvedValue(undefined);
      mockFolderStorageObjectRepository.save.mockResolvedValue(undefined);
      mockJobQueue.addJob.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.생성(
        {
          name: 'new-folder',
          parentId: 'parent-folder-id',
          conflictStrategy: FolderConflictStrategy.ERROR,
        },
        'user-1',
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result).toBeDefined();
      expect(result.name).toBe('new-folder');
      expect(result.path).toBe('/new-folder');
      expect(result.storageStatus.nas).toBe('SYNCING');
      expect(mockJobQueue.addJob).toHaveBeenCalledWith(
        'NAS_SYNC_MKDIR',
        expect.objectContaining({
          path: '/new-folder',
        }),
      );
    });

    /**
     * 📌 테스트 시나리오: 유효하지 않은 폴더명
     *
     * 🎯 검증 목적:
     *   - FLOW 1-1 step 1: 폴더명 유효성 검사
     *
     * ✅ 기대 결과:
     *   - 400 INVALID_FOLDER_NAME 에러 발생
     */
    it('빈 폴더명으로 생성 시 400 INVALID_FOLDER_NAME 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const request = {
        name: '',
        parentId: 'parent-folder-id',
      };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.생성(request, 'user-1')).rejects.toThrow(BadRequestException);
    });

    /**
     * 📌 테스트 시나리오: 특수문자가 포함된 폴더명
     *
     * 🎯 검증 목적:
     *   - 파일시스템 제약에 맞는 폴더명 검증
     *
     * ✅ 기대 결과:
     *   - 400 INVALID_FOLDER_NAME 에러 발생
     */
    it('특수문자가 포함된 폴더명으로 생성 시 400 INVALID_FOLDER_NAME 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const request = {
        name: 'folder<>name',
        parentId: 'parent-folder-id',
      };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.생성(request, 'user-1')).rejects.toThrow(BadRequestException);
    });

    /**
     * 📌 테스트 시나리오: 상위 폴더가 존재하지 않음
     *
     * 🎯 검증 목적:
     *   - FLOW 1-1 step 4: 상위 폴더 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 PARENT_FOLDER_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 상위 폴더 ID로 생성 시 404 PARENT_FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFolderRepository.findById.mockResolvedValue(null);

      const request = {
        name: 'new-folder',
        parentId: 'non-existent-parent-id',
      };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.생성(request, 'user-1')).rejects.toThrow(NotFoundException);
    });

    /**
     * 📌 테스트 시나리오: 중복 폴더명 + ERROR 전략
     *
     * 🎯 검증 목적:
     *   - FLOW 1-1 step 5: 중복 폴더명 체크 (ERROR 전략)
     *
     * ✅ 기대 결과:
     *   - 409 DUPLICATE_FOLDER_EXISTS 에러 발생
     */
    it('중복 폴더명 + ERROR 전략 시 409 DUPLICATE_FOLDER_EXISTS 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const parentFolder = new FolderEntity({
        id: 'parent-folder-id',
        name: 'parent',
        parentId: null,
        path: '/',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(parentFolder);
      mockFolderRepository.existsByNameInParent.mockResolvedValue(true);

      const request = {
        name: 'existing-folder',
        parentId: 'parent-folder-id',
        conflictStrategy: FolderConflictStrategy.ERROR,
      };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.생성(request, 'user-1')).rejects.toThrow(ConflictException);
    });

    /**
     * 📌 테스트 시나리오: 중복 폴더명 + RENAME 전략
     *
     * 🎯 검증 목적:
     *   - 중복 폴더명 발생 시 자동으로 이름 변경 (예: folder → folder (1))
     *
     * ✅ 기대 결과:
     *   - 폴더가 자동 이름 변경되어 생성됨
     */
    it('중복 폴더명 + RENAME 전략 시 자동으로 이름이 변경되어 생성되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const parentFolder = new FolderEntity({
        id: 'parent-folder-id',
        name: 'parent',
        parentId: null,
        path: '/',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(parentFolder);
      // 첫 번째 호출: 기본 이름 존재함
      // 두 번째 호출: folder (1) 존재하지 않음
      mockFolderRepository.existsByNameInParent
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockFolderRepository.save.mockResolvedValue(undefined);
      mockFolderStorageObjectRepository.save.mockResolvedValue(undefined);
      mockJobQueue.addJob.mockResolvedValue(undefined);

      const request = {
        name: 'existing-folder',
        parentId: 'parent-folder-id',
        conflictStrategy: FolderConflictStrategy.RENAME,
      };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.생성(request, 'user-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.name).toBe('existing-folder (1)');
    });
  });

  // =================================================================
  // 📁 2. 폴더명 변경 (PUT /folders/{folderId}/rename) 플로우 테스트
  // =================================================================
  describe('폴더명 변경 (이름변경)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 폴더명 변경
     *
     * 🎯 검증 목적:
     *   - FLOW 3-1 정상 흐름 검증
     *   - 폴더명 변경 후 하위 폴더 경로 일괄 업데이트
     *
     * ✅ 기대 결과:
     *   - 폴더명과 경로가 변경되고 NAS 동기화 작업이 큐에 추가됨
     */
    it('정상적인 폴더명 변경 시 경로가 업데이트되고 NAS 동기화 작업이 큐에 추가되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'old-name',
        parentId: 'parent-id',
        path: '/parent/old-name',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/old-name',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.existsByNameInParent.mockResolvedValue(false);
      mockFolderRepository.save.mockResolvedValue(undefined);
      mockFolderRepository.updatePathByPrefix.mockResolvedValue(0);
      mockFolderStorageObjectRepository.save.mockResolvedValue(undefined);
      mockJobQueue.addJob.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.이름변경(
        'folder-1',
        { newName: 'new-name' },
        'user-1',
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.name).toBe('new-name');
      expect(result.path).toBe('/parent/new-name');
      expect(mockFolderRepository.updatePathByPrefix).toHaveBeenCalledWith(
        '/parent/old-name',
        '/parent/new-name',
        expect.anything(),
      );
      expect(mockJobQueue.addJob).toHaveBeenCalledWith(
        'NAS_SYNC_RENAME_DIR',
        expect.objectContaining({
          oldPath: '/parent/old-name',
          newPath: '/parent/new-name',
        }),
      );
    });

    /**
     * 📌 테스트 시나리오: 존재하지 않는 폴더 이름 변경 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 3-1 step 2: 폴더 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 FOLDER_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 폴더 이름 변경 시 404 FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFolderRepository.findByIdForUpdate.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(
        service.이름변경('non-existent-folder', { newName: 'new-name' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * 📌 테스트 시나리오: 동기화 중인 폴더 이름 변경 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 3-1 step 3: NAS 동기화 상태 확인 (BUSY 체크)
     *
     * ✅ 기대 결과:
     *   - 409 FOLDER_SYNCING 에러 발생
     */
    it('동기화 중인 폴더 이름 변경 시 409 FOLDER_SYNCING 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'old-name',
        parentId: 'parent-id',
        path: '/parent/old-name',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const syncingStorageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/old-name',
        availabilityStatus: FolderAvailabilityStatus.SYNCING,
        createdAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(syncingStorageObject);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(
        service.이름변경('folder-1', { newName: 'new-name' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    /**
     * 📌 테스트 시나리오: 중복 폴더명으로 변경 시도 (ERROR 전략)
     *
     * 🎯 검증 목적:
     *   - FLOW 3-1 step 4: 중복 폴더명 체크
     *
     * ✅ 기대 결과:
     *   - 409 DUPLICATE_FOLDER_EXISTS 에러 발생
     */
    it('중복 폴더명으로 변경 시 409 DUPLICATE_FOLDER_EXISTS 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'old-name',
        parentId: 'parent-id',
        path: '/parent/old-name',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/old-name',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.existsByNameInParent.mockResolvedValue(true);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(
        service.이름변경(
          'folder-1',
          { newName: 'existing-name', conflictStrategy: FolderConflictStrategy.ERROR },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =================================================================
  // 📁 3. 폴더 이동 (POST /folders/{folderId}/move) 플로우 테스트
  // =================================================================
  describe('폴더 이동 (이동)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 폴더 이동
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 정상 흐름 검증
     *   - 폴더 이동 후 하위 폴더 경로 일괄 업데이트
     *
     * ✅ 기대 결과:
     *   - 폴더가 대상 폴더로 이동되고 NAS 동기화 작업이 큐에 추가됨
     */
    it('정상적인 폴더 이동 시 경로가 업데이트되고 NAS 동기화 작업이 큐에 추가되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'folder-to-move',
        parentId: 'old-parent-id',
        path: '/old-parent/folder-to-move',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const targetParent = new FolderEntity({
        id: 'target-parent-id',
        name: 'target-parent',
        parentId: null,
        path: '/target-parent',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/old-parent/folder-to-move',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(targetParent);
      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.existsByNameInParent.mockResolvedValue(false);
      mockFolderRepository.save.mockResolvedValue(undefined);
      mockFolderRepository.updatePathByPrefix.mockResolvedValue(0);
      mockFolderStorageObjectRepository.save.mockResolvedValue(undefined);
      mockJobQueue.addJob.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.이동(
        'folder-1',
        { targetParentId: 'target-parent-id' },
        'user-1',
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.parentId).toBe('target-parent-id');
      expect(result.path).toBe('/target-parent/folder-to-move');
      expect(mockJobQueue.addJob).toHaveBeenCalledWith(
        'NAS_SYNC_MOVE_DIR',
        expect.objectContaining({
          oldPath: '/old-parent/folder-to-move',
          newPath: '/target-parent/folder-to-move',
        }),
      );
    });

    /**
     * 📌 테스트 시나리오: 대상 폴더가 존재하지 않음
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 step 2: 대상 상위 폴더 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 TARGET_FOLDER_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 대상 폴더로 이동 시 404 TARGET_FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFolderRepository.findById.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(
        service.이동('folder-1', { targetParentId: 'non-existent-target' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * 📌 테스트 시나리오: 순환 이동 방지 (자기 자신으로 이동)
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 step 4: 순환 이동 방지 체크
     *   - 자기 자신의 하위 폴더로 이동 시 무한 순환 발생 방지
     *
     * ✅ 기대 결과:
     *   - 409 CIRCULAR_MOVE 에러 발생
     */
    it('자기 자신으로 이동 시 409 CIRCULAR_MOVE 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'folder',
        parentId: 'parent-id',
        path: '/parent/folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 대상 폴더가 자기 자신
      mockFolderRepository.findById.mockResolvedValue(folder);
      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(
        service.이동('folder-1', { targetParentId: 'folder-1' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    /**
     * 📌 테스트 시나리오: 순환 이동 방지 (하위 폴더로 이동)
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 step 4: 순환 이동 방지 체크
     *   - /A를 /A/B/C로 이동하면 /A/B/C/A/B/C... 순환 발생
     *
     * ✅ 기대 결과:
     *   - 409 CIRCULAR_MOVE 에러 발생
     */
    it('자신의 하위 폴더로 이동 시 409 CIRCULAR_MOVE 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-A',
        name: 'A',
        parentId: 'root-id',
        path: '/A',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const childFolder = new FolderEntity({
        id: 'folder-C',
        name: 'C',
        parentId: 'folder-B',
        path: '/A/B/C', // folder의 하위 경로
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(childFolder);
      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(
        service.이동('folder-A', { targetParentId: 'folder-C' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    /**
     * 📌 테스트 시나리오: 중복 폴더명 + SKIP 전략
     *
     * 🎯 검증 목적:
     *   - 대상 폴더에 동일 이름의 폴더가 있을 때 SKIP 전략 동작 확인
     *
     * ✅ 기대 결과:
     *   - 이동하지 않고 skipped: true 반환
     */
    it('중복 폴더명 + SKIP 전략 시 이동하지 않고 skipped 반환해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'folder-to-move',
        parentId: 'old-parent-id',
        path: '/old-parent/folder-to-move',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const targetParent = new FolderEntity({
        id: 'target-parent-id',
        name: 'target-parent',
        parentId: null,
        path: '/target-parent',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/old-parent/folder-to-move',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findById.mockResolvedValue(targetParent);
      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.existsByNameInParent.mockResolvedValue(true); // 중복 존재

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.이동(
        'folder-1',
        {
          targetParentId: 'target-parent-id',
          conflictStrategy: MoveFolderConflictStrategy.SKIP,
        },
        'user-1',
      );

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.skipped).toBe(true);
      expect(result.reason).toBeDefined();
      expect(mockJobQueue.addJob).not.toHaveBeenCalled();
    });
  });

  // =================================================================
  // 📁 4. 폴더 삭제 (DELETE /folders/{folderId}) 플로우 테스트
  // =================================================================
  describe('폴더 삭제 (delete)', () => {
    /**
     * 📌 테스트 시나리오: 빈 폴더 정상 삭제
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 정상 흐름 검증
     *   - 빈 폴더만 삭제 가능 정책 준수
     *
     * ✅ 기대 결과:
     *   - 폴더 상태가 TRASHED로 변경되고 NAS 동기화 작업이 큐에 추가됨
     */
    it('빈 폴더 삭제 시 상태가 TRASHED로 변경되고 NAS 동기화 작업이 큐에 추가되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'empty-folder',
        parentId: 'parent-id',
        path: '/parent/empty-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/empty-folder',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      // 빈 폴더: 하위 폴더 0개, 파일 0개
      mockFolderRepository.findByParentId.mockResolvedValue([]);
      mockFileRepository.findByFolderId.mockResolvedValue([]);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
      });
      mockFolderRepository.save.mockResolvedValue(undefined);
      mockTrashRepository.save.mockResolvedValue(undefined);
      mockFolderStorageObjectRepository.save.mockResolvedValue(undefined);
      mockJobQueue.addJob.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.delete('folder-1', 'user-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.state).toBe(FolderState.TRASHED);
      expect(mockJobQueue.addJob).toHaveBeenCalledWith(
        'NAS_FOLDER_TO_TRASH',
        expect.objectContaining({
          folderId: 'folder-1',
        }),
      );
    });

    /**
     * 📌 테스트 시나리오: 존재하지 않는 폴더 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 2: 폴더 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 FOLDER_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 폴더 삭제 시 404 FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFolderRepository.findByIdForUpdate.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('non-existent-folder', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * 📌 테스트 시나리오: 이미 휴지통에 있는 폴더 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 2: 이미 TRASHED 상태 체크
     *
     * ✅ 기대 결과:
     *   - 400 FOLDER_ALREADY_TRASHED 에러 발생
     */
    it('이미 휴지통에 있는 폴더 삭제 시 400 FOLDER_ALREADY_TRASHED 에러가 발생해야 한다', async () => {
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

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(trashedFolder);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('folder-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    /**
     * ============================================================
     * 🚨 중요: 빈 폴더 체크 테스트 (플로우 문서 정책)
     * ============================================================
     *
     * 📌 테스트 시나리오: 하위 폴더가 있는 폴더 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 3: 빈 폴더 체크 (정책: 빈 폴더만 삭제 가능)
     *   - "폴더 안에 파일 또는 하위 폴더가 있으면 삭제 불가"
     *
     * ✅ 기대 결과:
     *   - 409 FOLDER_NOT_EMPTY 에러 발생 (childFolderCount, childFileCount 포함)
     */
    it('하위 폴더가 있는 폴더 삭제 시 409 FOLDER_NOT_EMPTY 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'folder-with-children',
        parentId: 'parent-id',
        path: '/parent/folder-with-children',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/folder-with-children',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      const childFolder = new FolderEntity({
        id: 'child-folder-1',
        name: 'child-folder',
        parentId: 'folder-1',
        path: '/parent/folder-with-children/child-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      // 하위 폴더 1개 존재
      mockFolderRepository.findByParentId.mockResolvedValue([childFolder]);
      mockFileRepository.findByFolderId.mockResolvedValue([]);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 0,
        folderCount: 1, // 하위 폴더 존재
        totalSize: 0,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('folder-1', 'user-1')).rejects.toThrow(ConflictException);

      // 트랜잭션 롤백 확인
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    /**
     * 📌 테스트 시나리오: 파일이 있는 폴더 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 3: 빈 폴더 체크 (정책: 빈 폴더만 삭제 가능)
     *   - "폴더 안에 파일 또는 하위 폴더가 있으면 삭제 불가"
     *
     * ✅ 기대 결과:
     *   - 409 FOLDER_NOT_EMPTY 에러 발생
     */
    it('파일이 있는 폴더 삭제 시 409 FOLDER_NOT_EMPTY 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'folder-with-files',
        parentId: 'parent-id',
        path: '/parent/folder-with-files',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/folder-with-files',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      const file = {
        id: 'file-1',
        name: 'test-file.txt',
        folderId: 'folder-1',
      };

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.findByParentId.mockResolvedValue([]);
      // 파일 1개 존재
      mockFileRepository.findByFolderId.mockResolvedValue([file]);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 1, // 파일 존재
        folderCount: 0,
        totalSize: 1024,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('folder-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    /**
     * 📌 테스트 시나리오: 파일과 하위 폴더가 모두 있는 폴더 삭제 시도
     *
     * 🎯 검증 목적:
     *   - 복합적인 비어있지 않은 폴더 케이스
     *
     * ✅ 기대 결과:
     *   - 409 FOLDER_NOT_EMPTY 에러 발생 (childFolderCount, childFileCount 포함)
     */
    it('파일과 하위 폴더가 모두 있는 폴더 삭제 시 409 FOLDER_NOT_EMPTY 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'folder-with-contents',
        parentId: 'parent-id',
        path: '/parent/folder-with-contents',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/folder-with-contents',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 3, // 파일 3개
        folderCount: 2, // 하위 폴더 2개
        totalSize: 10240,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      try {
        await service.delete('folder-1', 'user-1');
        fail('Expected ConflictException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        // 에러 메시지에 하위 폴더/파일 수가 포함되어야 함
        const response = (error as ConflictException).getResponse();
        expect(response).toHaveProperty('code', 'FOLDER_NOT_EMPTY');
      }
    });

    /**
     * 📌 테스트 시나리오: 동기화 중인 폴더 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 4: NAS 동기화 상태 확인
     *
     * ✅ 기대 결과:
     *   - 409 FOLDER_SYNCING 에러 발생
     */
    it('동기화 중인 폴더 삭제 시 409 FOLDER_SYNCING 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'syncing-folder',
        parentId: 'parent-id',
        path: '/parent/syncing-folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const syncingStorageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/syncing-folder',
        availabilityStatus: FolderAvailabilityStatus.SYNCING,
        createdAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(syncingStorageObject);
      // 빈 폴더로 설정
      mockFolderRepository.getStatistics.mockResolvedValue({
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('folder-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  // =================================================================
  // 📁 5. 트랜잭션 및 롤백 테스트
  // =================================================================
  describe('트랜잭션 처리', () => {
    /**
     * 📌 테스트 시나리오: 에러 발생 시 트랜잭션 롤백
     *
     * 🎯 검증 목적:
     *   - 작업 중 에러 발생 시 트랜잭션이 롤백되는지 확인
     *
     * ✅ 기대 결과:
     *   - queryRunner.rollbackTransaction이 호출됨
     */
    it('이름변경 중 에러 발생 시 트랜잭션이 롤백되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'folder',
        parentId: 'parent-id',
        path: '/parent/folder',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const storageObject = new FolderStorageObjectEntity({
        id: 'storage-1',
        folderId: 'folder-1',
        storageType: 'NAS',
        objectKey: '/parent/folder',
        availabilityStatus: FolderAvailabilityStatus.AVAILABLE,
        createdAt: new Date(),
      });

      mockFolderRepository.findByIdForUpdate.mockResolvedValue(folder);
      mockFolderStorageObjectRepository.findByFolderId.mockResolvedValue(storageObject);
      mockFolderRepository.existsByNameInParent.mockResolvedValue(false);
      // save에서 에러 발생
      mockFolderRepository.save.mockRejectedValue(new Error('DB Error'));

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & ✅ THEN
      // ═══════════════════════════════════════════════════════
      await expect(
        service.이름변경('folder-1', { newName: 'new-name' }, 'user-1'),
      ).rejects.toThrow();

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });
  });
});
