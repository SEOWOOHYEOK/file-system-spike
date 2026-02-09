/**
 * ============================================================
 * 📦 파일 관리 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FileManageService.rename (파일명 변경)
 *   - FileManageService.move (파일 이동)
 *   - FileManageService.delete (파일 삭제 - 휴지통 이동)
 *
 * 📋 비즈니스 맥락:
 *   - 문서 기준: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 *   - FLOW 3-1: 파일명 변경 (FOR UPDATE 락, NAS 동기화 상태 체크)
 *   - FLOW 3-2: 파일 이동 (대상 폴더 존재, 충돌 전략)
 *   - FLOW 4-1: 파일 삭제 (lease_count 체크, 휴지통 이동)
 *   - 동일 파일명 중복 허용 정책(등록일 기준)을 준수해야 한다.
 *
 * ⚠️ 중요 고려사항:
 *   - 중복 검증 시 createdAt이 반드시 포함되어야 함
 *   - NAS 동기화 중 파일 조작 차단 (409 FILE_SYNCING)
 *   - 다운로드 중 파일 삭제 차단 (409 FILE_IN_USE)
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { FileManageService } from './file-manage.service';
import {
  AvailabilityStatus,
  ConflictStrategy,
  FileEntity,
  MoveConflictStrategy,
  StorageType,
} from '../../domain/file';
import { FileState } from '../../domain/file/type/file.type';
import { FileStorageObjectEntity } from '../../domain/storage/file/entity/file-storage-object.entity';
import { FolderEntity, FolderState } from '../../domain/folder';

describe('FileManageService', () => {
  /**
   * 🎭 Mock 설정
   * 📍 Domain Services Mock
   */
  const mockFileDomainService = {
    조회: jest.fn(),
    잠금조회: jest.fn(),
    중복확인: jest.fn(),
    저장: jest.fn(),
  };
  const mockFolderDomainService = {
    조회: jest.fn(),
  };
  const mockTrashDomainService = {
    파일메타생성: jest.fn(),
  };
  const mockSyncEventDomainService = {
    저장: jest.fn(),
  };
  const mockFileNasStorageDomainService = {
    조회: jest.fn(),
    잠금조회: jest.fn(),
    저장: jest.fn(),
  };
  const mockJobQueue = {
    addJob: jest.fn(),
  };
  const mockFileHistoryService = {
    logFileRenamed: jest.fn().mockResolvedValue(undefined),
    logFileMoved: jest.fn().mockResolvedValue(undefined),
    logFileTrashed: jest.fn().mockResolvedValue(undefined),
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

  let service: FileManageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileManageService(
      mockFileDomainService as any,
      mockFolderDomainService as any,
      mockTrashDomainService as any,
      mockSyncEventDomainService as any,
      mockFileNasStorageDomainService as any,
      mockJobQueue as any,
      mockDataSource as any,
      mockFileHistoryService as any,
    );
  });

  /**
   * 📌 테스트 시나리오: rename 시 동일 이름이 존재하지만 createdAt이 다른 경우
   *
   * 🎯 검증 목적:
   *   - 문서 정책(파일명 + 등록일자) 기준을 rename에도 적용
   *
   * ✅ 기대 결과:
   *   - ConflictException 없이 rename 성공
   */
  it('rename에서 createdAt이 다른 동일 이름은 충돌로 보지 않아야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
    const file = new FileEntity({
      id: 'file-1',
      name: '111.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.ACTIVE,
      createdAt: fileCreatedAt,
      updatedAt: fileCreatedAt,
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-1',
      fileId: 'file-1',
      storageType: StorageType.NAS,
      objectKey: '20240101000000__111.txt',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });
    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFileDomainService.잠금조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
    mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
    mockFolderDomainService.조회.mockResolvedValue(folder);
    mockFileDomainService.저장.mockResolvedValue(file);
    mockFileNasStorageDomainService.저장.mockResolvedValue(nasObject);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);

    mockFileDomainService.중복확인.mockImplementation(
      (
        folderId: string,
        name: string,
        mimeType: string,
        excludeFileId?: string,
        createdAt?: Date,
      ) => {
        if (!createdAt) {
          return true;
        }
        return createdAt.getTime() !== fileCreatedAt.getTime();
      },
    );

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.rename('file-1', { newName: '111.txt' }, 'user-1');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result.name).toBe('111.txt');
  });

  /**
   * 📌 테스트 시나리오: rename 요청에 newName이 비어있는 경우
   *
   * 🎯 검증 목적:
   *   - 잘못된 요청은 도메인 로직 이전에 차단되어야 함
   *
   * ✅ 기대 결과:
   *   - BadRequestException (INVALID_FILE_NAME)
   */
  it('rename 요청에서 newName이 비어있으면 INVALID_FILE_NAME을 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
    const file = new FileEntity({
      id: 'file-1',
      name: 'test.pdf',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'application/pdf',
      state: FileState.ACTIVE,
      createdAt: fileCreatedAt,
      updatedAt: fileCreatedAt,
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-1',
      fileId: 'file-1',
      storageType: StorageType.NAS,
      objectKey: '20240101000000__test.pdf',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });

    mockFileDomainService.잠금조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(service.rename('file-1', { newName: '   ' }, 'user-1')).rejects.toMatchObject({
      response: { code: 'INVALID_FILE_NAME' },
    });
  });

  /**
   * 📌 테스트 시나리오: rename 시 확장자 변경 요청
   *
   * 🎯 검증 목적:
   *   - 파일 확장자 변경은 허용되지 않아야 함
   *
   * ✅ 기대 결과:
   *   - BadRequestException (FILE_EXTENSION_CHANGE_NOT_ALLOWED)
   */
  it('rename에서 확장자가 바뀌면 FILE_EXTENSION_CHANGE_NOT_ALLOWED를 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
    const file = new FileEntity({
      id: 'file-1',
      name: 'test.pdf',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'application/pdf',
      state: FileState.ACTIVE,
      createdAt: fileCreatedAt,
      updatedAt: fileCreatedAt,
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-1',
      fileId: 'file-1',
      storageType: StorageType.NAS,
      objectKey: '20240101000000__test.pdf',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });

    mockFileDomainService.잠금조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(service.rename('file-1', { newName: 'test.txt' }, 'user-1')).rejects.toMatchObject({
      response: { code: 'FILE_EXTENSION_CHANGE_NOT_ALLOWED' },
    });
  });

  /**
   * 📌 테스트 시나리오: rename 시 NAS objectKey 생성 규칙
   *
   * 🎯 검증 목적:
   *   - 기존 timestamp 유지 + 새 파일명으로 objectKey 변경
   *
   * ✅ 기대 결과:
   *   - 20240101000000__new.txt 형식
   */
  it('rename은 기존 timestamp를 유지한 objectKey로 변경해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
    const file = new FileEntity({
      id: 'file-1',
      name: 'old.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.ACTIVE,
      createdAt: fileCreatedAt,
      updatedAt: fileCreatedAt,
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-1',
      fileId: 'file-1',
      storageType: StorageType.NAS,
      objectKey: '20240101000000__old.txt',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });
    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFileDomainService.잠금조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
    mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
    mockFolderDomainService.조회.mockResolvedValue(folder);
    mockFileDomainService.저장.mockResolvedValue(file);
    mockFileNasStorageDomainService.저장.mockResolvedValue(nasObject);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);
    mockFileDomainService.중복확인.mockResolvedValue(false);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.rename('file-1', { newName: 'new.txt' }, 'user-1');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(mockFileNasStorageDomainService.저장).toHaveBeenCalledWith(
      expect.objectContaining({
        storageType: StorageType.NAS,
        objectKey: '20240101000000__new.txt',
      }),
      expect.anything(),
    );
  });

  /**
   * 📌 테스트 시나리오: move 시 동일 이름이 존재하지만 createdAt이 다른 경우
   *
   * 🎯 검증 목적:
   *   - move에서도 중복 정책(파일명 + 등록일자) 일관성 유지
   *
   * ✅ 기대 결과:
   *   - ConflictException 없이 move 성공
   */
  it('move에서 createdAt이 다른 동일 이름은 충돌로 보지 않아야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
    const file = new FileEntity({
      id: 'file-2',
      name: '222.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.ACTIVE,
      createdAt: fileCreatedAt,
      updatedAt: fileCreatedAt,
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-2',
      fileId: 'file-2',
      storageType: StorageType.NAS,
      objectKey: '20240101000000__222.txt',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });
    const targetFolder = new FolderEntity({
      id: 'folder-2',
      name: 'target',
      parentId: null,
      path: '/target',
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFolderDomainService.조회.mockResolvedValue(targetFolder);
    mockFileDomainService.잠금조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
    mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
    mockFileDomainService.저장.mockResolvedValue(file);
    mockFileNasStorageDomainService.저장.mockResolvedValue(nasObject);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);

    mockFileDomainService.중복확인.mockImplementation(
      (
        folderId: string,
        name: string,
        mimeType: string,
        excludeFileId?: string,
        createdAt?: Date,
      ) => {
        if (!createdAt) {
          return true;
        }
        return createdAt.getTime() !== fileCreatedAt.getTime();
      },
    );

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.move(
      'file-2',
      { targetFolderId: 'folder-2', conflictStrategy: MoveConflictStrategy.ERROR },
      'user-1',
    );

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result.folderId).toBe('folder-2');
  });

  /**
   * 📌 테스트 시나리오: move 시 objectKey 유지
   *
   * 🎯 검증 목적:
   *   - 파일 이동은 objectKey를 변경하지 않고 경로만 변경해야 한다.
   *
   * ✅ 기대 결과:
   *   - NAS objectKey는 기존 값 유지
   */
  it('move는 objectKey를 변경하지 않고 유지해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
    const file = new FileEntity({
      id: 'file-2',
      name: '222.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.ACTIVE,
      createdAt: fileCreatedAt,
      updatedAt: fileCreatedAt,
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-2',
      fileId: 'file-2',
      storageType: StorageType.NAS,
      objectKey: '20240101000000__222.txt',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });
    const targetFolder = new FolderEntity({
      id: 'folder-2',
      name: 'target',
      parentId: null,
      path: '/target',
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFolderDomainService.조회.mockResolvedValue(targetFolder);
    mockFileDomainService.잠금조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
    mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
    mockFileDomainService.저장.mockResolvedValue(file);
    mockFileNasStorageDomainService.저장.mockResolvedValue(nasObject);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);
    mockFileDomainService.중복확인.mockResolvedValue(false);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.move(
      'file-2',
      { targetFolderId: 'folder-2', conflictStrategy: MoveConflictStrategy.ERROR },
      'user-1',
    );

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(mockFileNasStorageDomainService.저장).toHaveBeenCalledWith(
      expect.objectContaining({
        storageType: StorageType.NAS,
        objectKey: '20240101000000__222.txt',
      }),
      expect.anything(),
    );
  });

  /**
   * 📌 테스트 시나리오: rename/move 시 큐 등록 payload 정합성
   *
   * 🎯 검증 목적:
   *   - syncEventId가 큐 등록에 포함되어야 함
   *
   * ✅ 기대 결과:
   *   - NAS_SYNC_RENAME, NAS_SYNC_MOVE 모두 syncEventId 포함
   */
  it('rename/move 큐 등록에 syncEventId가 포함되어야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
    const file = new FileEntity({
      id: 'file-1',
      name: 'old.txt',
      folderId: 'folder-1',
      sizeBytes: 10,
      mimeType: 'text/plain',
      state: FileState.ACTIVE,
      createdAt: fileCreatedAt,
      updatedAt: fileCreatedAt,
    });
    const nasObject = new FileStorageObjectEntity({
      id: 'nas-1',
      fileId: 'file-1',
      storageType: StorageType.NAS,
      objectKey: '20240101000000__old.txt',
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      accessCount: 0,
      leaseCount: 0,
      createdAt: new Date(),
    });
    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const targetFolder = new FolderEntity({
      id: 'folder-2',
      name: 'target',
      parentId: null,
      path: '/target',
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFileDomainService.잠금조회.mockResolvedValue(file);
    mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
    mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
    mockFolderDomainService.조회.mockResolvedValueOnce(folder).mockResolvedValueOnce(targetFolder);
    mockFileDomainService.저장.mockResolvedValue(file);
    mockFileNasStorageDomainService.저장.mockResolvedValue(nasObject);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);
    mockFileDomainService.중복확인.mockResolvedValue(false);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.rename('file-1', { newName: 'new.txt' }, 'user-1');
    // rename 이후 상태 변경으로 동기화 중일 수 있으므로 NAS 상태를 다시 AVAILABLE로 설정
    nasObject.updateStatus(AvailabilityStatus.AVAILABLE);
    await service.move(
      'file-1',
      { targetFolderId: 'folder-2', conflictStrategy: MoveConflictStrategy.ERROR },
      'user-1',
    );

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(mockJobQueue.addJob).toHaveBeenCalledWith(
      'NAS_FILE_SYNC',
      expect.objectContaining({ syncEventId: 'mock-uuid', action: 'rename' }),
    );
    expect(mockJobQueue.addJob).toHaveBeenCalledWith(
      'NAS_FILE_SYNC',
      expect.objectContaining({ syncEventId: 'mock-uuid', action: 'move' }),
    );
  });

  // =================================================================
  // 📁 FLOW 3-1: 파일명 변경 - 에러 케이스 테스트
  // =================================================================
  describe('rename 에러 케이스', () => {
    /**
     * 📌 테스트 시나리오: 존재하지 않는 파일 이름 변경 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 3-1 step 2: 파일 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 FILE_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 파일 이름 변경 시 404 FILE_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFileDomainService.잠금조회.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.rename('non-existent-file', { newName: 'new.txt' }, 'user-1'),
      ).rejects.toMatchObject({
        response: { code: 'FILE_NOT_FOUND' },
      });
    });

    /**
     * 📌 테스트 시나리오: NAS 동기화 중인 파일 이름 변경 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 3-1 step 3: NAS 동기화 상태 체크 (BUSY)
     *
     * ✅ 기대 결과:
     *   - 409 FILE_SYNCING 에러 발생
     */
    it('NAS 동기화 중인 파일 이름 변경 시 409 FILE_SYNCING 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
      const file = new FileEntity({
        id: 'file-1',
        name: 'test.txt',
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.ACTIVE,
        createdAt: fileCreatedAt,
        updatedAt: fileCreatedAt,
      });
      const syncingNasObject = new FileStorageObjectEntity({
        id: 'nas-1',
        fileId: 'file-1',
        storageType: StorageType.NAS,
        objectKey: '20240101000000__test.txt',
        availabilityStatus: AvailabilityStatus.SYNCING,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });

      mockFileDomainService.잠금조회.mockResolvedValue(file);
      mockFileNasStorageDomainService.잠금조회.mockResolvedValue(syncingNasObject);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.rename('file-1', { newName: 'new.txt' }, 'user-1'),
      ).rejects.toMatchObject({
        response: { code: 'FILE_SYNCING' },
      });
    });
  });

  // =================================================================
  // 📁 FLOW 3-2: 파일 이동 - 에러 케이스 테스트
  // =================================================================
  describe('move 에러 케이스', () => {
    /**
     * 📌 테스트 시나리오: 존재하지 않는 파일 이동 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 step 3: 파일 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 FILE_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 파일 이동 시 404 FILE_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const targetFolder = new FolderEntity({
        id: 'folder-2',
        name: 'target',
        parentId: null,
        path: '/target',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderDomainService.조회.mockResolvedValue(targetFolder);
      mockFileDomainService.잠금조회.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.move(
          'non-existent-file',
          { targetFolderId: 'folder-2', conflictStrategy: MoveConflictStrategy.ERROR },
          'user-1',
        ),
      ).rejects.toMatchObject({
        response: { code: 'FILE_NOT_FOUND' },
      });
    });

    /**
     * 📌 테스트 시나리오: 존재하지 않는 대상 폴더로 이동 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 step 2: 대상 폴더 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 TARGET_FOLDER_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 대상 폴더로 이동 시 404 TARGET_FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFolderDomainService.조회.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.move(
          'file-1',
          { targetFolderId: 'non-existent-folder', conflictStrategy: MoveConflictStrategy.ERROR },
          'user-1',
        ),
      ).rejects.toMatchObject({
        response: { code: 'TARGET_FOLDER_NOT_FOUND' },
      });
    });

    /**
     * 📌 테스트 시나리오: NAS 동기화 중인 파일 이동 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 step 4: NAS 동기화 상태 체크 (BUSY)
     *
     * ✅ 기대 결과:
     *   - 409 FILE_SYNCING 에러 발생
     */
    it('NAS 동기화 중인 파일 이동 시 409 FILE_SYNCING 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
      const file = new FileEntity({
        id: 'file-1',
        name: 'test.txt',
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.ACTIVE,
        createdAt: fileCreatedAt,
        updatedAt: fileCreatedAt,
      });
      const syncingNasObject = new FileStorageObjectEntity({
        id: 'nas-1',
        fileId: 'file-1',
        storageType: StorageType.NAS,
        objectKey: '20240101000000__test.txt',
        availabilityStatus: AvailabilityStatus.SYNCING,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      const targetFolder = new FolderEntity({
        id: 'folder-2',
        name: 'target',
        parentId: null,
        path: '/target',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const sourceFolder = new FolderEntity({
        id: 'folder-1',
        name: 'source',
        parentId: null,
        path: '/source',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderDomainService.조회
        .mockResolvedValueOnce(targetFolder) // 대상 폴더 조회
        .mockResolvedValueOnce(sourceFolder); // 소스 폴더 조회
      mockFileDomainService.잠금조회.mockResolvedValue(file);
      mockFileNasStorageDomainService.잠금조회.mockResolvedValue(syncingNasObject);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(
        service.move(
          'file-1',
          { targetFolderId: 'folder-2', conflictStrategy: MoveConflictStrategy.ERROR },
          'user-1',
        ),
      ).rejects.toMatchObject({
        response: { code: 'FILE_SYNCING' },
      });
    });

    /**
     * 📌 테스트 시나리오: 중복 파일 + SKIP 전략
     *
     * 🎯 검증 목적:
     *   - FLOW 3-2 step 5: 충돌 처리 (SKIP)
     *
     * ✅ 기대 결과:
     *   - skipped: true 반환
     */
    it('중복 파일 + SKIP 전략 시 이동하지 않고 skipped 반환해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
      const file = new FileEntity({
        id: 'file-1',
        name: 'test.txt',
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.ACTIVE,
        createdAt: fileCreatedAt,
        updatedAt: fileCreatedAt,
      });
      const nasObject = new FileStorageObjectEntity({
        id: 'nas-1',
        fileId: 'file-1',
        storageType: StorageType.NAS,
        objectKey: '20240101000000__test.txt',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      const targetFolder = new FolderEntity({
        id: 'folder-2',
        name: 'target',
        parentId: null,
        path: '/target',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const sourceFolder = new FolderEntity({
        id: 'folder-1',
        name: 'source',
        parentId: null,
        path: '/source',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFolderDomainService.조회
        .mockResolvedValueOnce(targetFolder)
        .mockResolvedValueOnce(sourceFolder);
      mockFileDomainService.잠금조회.mockResolvedValue(file);
      mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
      // 중복 파일 존재
      mockFileDomainService.중복확인.mockResolvedValue(true);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.move(
        'file-1',
        { targetFolderId: 'folder-2', conflictStrategy: MoveConflictStrategy.SKIP },
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
  // 📁 FLOW 4-1: 파일 삭제 (휴지통 이동) 테스트
  // =================================================================
  describe('delete (휴지통 이동)', () => {
    /**
     * 📌 테스트 시나리오: 정상적인 파일 삭제
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 정상 흐름 검증
     *   - 파일 상태가 TRASHED로 변경되고 NAS 동기화 작업이 큐에 추가됨
     *
     * ✅ 기대 결과:
     *   - 200 OK (id, name, state=TRASHED, syncEventId)
     */
    it('정상적인 파일 삭제 시 상태가 TRASHED로 변경되고 큐 작업이 등록되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
      const file = new FileEntity({
        id: 'file-1',
        name: 'test.txt',
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.ACTIVE,
        createdAt: fileCreatedAt,
        updatedAt: fileCreatedAt,
      });
      const nasObject = new FileStorageObjectEntity({
        id: 'nas-1',
        fileId: 'file-1',
        storageType: StorageType.NAS,
        objectKey: '20240101000000__test.txt',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'test',
        parentId: null,
        path: '/test',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFileDomainService.잠금조회.mockResolvedValue(file);
      mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
      mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
      mockFolderDomainService.조회.mockResolvedValue(folder);
      mockFileDomainService.저장.mockResolvedValue(file);
      mockTrashDomainService.파일메타생성.mockResolvedValue(undefined);
      mockFileNasStorageDomainService.저장.mockResolvedValue(nasObject);
      mockSyncEventDomainService.저장.mockResolvedValue(undefined);
      mockJobQueue.addJob.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.delete('file-1', 'user-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.state).toBe(FileState.TRASHED);
      expect(result.syncEventId).toBe('mock-uuid');
      expect(mockTrashDomainService.파일메타생성).toHaveBeenCalled();
      expect(mockJobQueue.addJob).toHaveBeenCalledWith(
        'NAS_FILE_SYNC',
        expect.objectContaining({
          fileId: 'file-1',
          syncEventId: 'mock-uuid',
          action: 'trash',
        }),
      );
    });

    /**
     * 📌 테스트 시나리오: 존재하지 않는 파일 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 2: 파일 존재 확인
     *
     * ✅ 기대 결과:
     *   - 404 FILE_NOT_FOUND 에러 발생
     */
    it('존재하지 않는 파일 삭제 시 404 FILE_NOT_FOUND 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      mockFileDomainService.잠금조회.mockResolvedValue(null);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('non-existent-file', 'user-1')).rejects.toMatchObject({
        response: { code: 'FILE_NOT_FOUND' },
      });
    });

    /**
     * 📌 테스트 시나리오: 이미 휴지통에 있는 파일 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 2: 이미 TRASHED 상태 체크
     *
     * ✅ 기대 결과:
     *   - 400 FILE_ALREADY_TRASHED 에러 발생
     */
    it('이미 휴지통에 있는 파일 삭제 시 400 FILE_ALREADY_TRASHED 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const trashedFile = new FileEntity({
        id: 'file-1',
        name: 'test.txt',
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.TRASHED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFileDomainService.잠금조회.mockResolvedValue(trashedFile);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('file-1', 'user-1')).rejects.toMatchObject({
        response: { code: 'FILE_ALREADY_TRASHED' },
      });
    });

    /**
     * 📌 테스트 시나리오: NAS 동기화 중인 파일 삭제 시도
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 3: NAS 동기화 상태 체크 (BUSY)
     *
     * ✅ 기대 결과:
     *   - 409 FILE_SYNCING 에러 발생
     */
    it('NAS 동기화 중인 파일 삭제 시 409 FILE_SYNCING 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const file = new FileEntity({
        id: 'file-1',
        name: 'test.txt',
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const syncingNasObject = new FileStorageObjectEntity({
        id: 'nas-1',
        fileId: 'file-1',
        storageType: StorageType.NAS,
        objectKey: '20240101000000__test.txt',
        availabilityStatus: AvailabilityStatus.SYNCING,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });

      mockFileDomainService.잠금조회.mockResolvedValue(file);
      mockFileNasStorageDomainService.잠금조회.mockResolvedValue(syncingNasObject);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('file-1', 'user-1')).rejects.toMatchObject({
        response: { code: 'FILE_SYNCING' },
      });
    });

    /**
     * ============================================================
     * 🚨 중요: 다운로드 중 파일 삭제 방지 테스트 (플로우 문서 정책)
     * ============================================================
     *
     * 📌 테스트 시나리오: 다운로드 중인 파일 삭제 시도 (lease_count > 0)
     *
     * 🎯 검증 목적:
     *   - FLOW 4-1 step 4: lease_count 체크 (다운로드 중 여부)
     *   - "파일을 사용 중인 사용자가 있어 삭제할 수 없습니다."
     *
     * ✅ 기대 결과:
     *   - 409 FILE_IN_USE 에러 발생
     */
    it('다운로드 중인 파일 삭제 시 409 FILE_IN_USE 에러가 발생해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const file = new FileEntity({
        id: 'file-1',
        name: 'test.txt',
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // lease_count > 0: 다운로드 중
      const nasObjectInUse = new FileStorageObjectEntity({
        id: 'nas-1',
        fileId: 'file-1',
        storageType: StorageType.NAS,
        objectKey: '20240101000000__test.txt',
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 5,
        leaseCount: 2, // 2명이 다운로드 중
        createdAt: new Date(),
      });

      mockFileDomainService.잠금조회.mockResolvedValue(file);
      mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObjectInUse);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
      // ═══════════════════════════════════════════════════════
      await expect(service.delete('file-1', 'user-1')).rejects.toMatchObject({
        response: { code: 'FILE_IN_USE' },
      });
    });

    /**
     * 📌 테스트 시나리오: 휴지통 이동 시 NAS 실제 파일명 사용
     *
     * 🎯 검증 목적:
     *   - 휴지통 경로에 NAS objectKey의 실제 파일명(타임스탬프 포함)이 사용되어야 함
     *   - file.name이 아닌 NAS objectKey에서 추출한 파일명 사용
     *
     * ✅ 기대 결과:
     *   - trashPath: .trash/{trashMetadataId}__20240101000000__test.txt
     */
    it('휴지통 이동 시 NAS objectKey의 실제 파일명(타임스탬프 포함)을 사용해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileCreatedAt = new Date('2024-01-01T00:00:00Z');
      const file = new FileEntity({
        id: 'file-1',
        name: 'test.txt', // 논리적 파일명
        folderId: 'folder-1',
        sizeBytes: 10,
        mimeType: 'text/plain',
        state: FileState.ACTIVE,
        createdAt: fileCreatedAt,
        updatedAt: fileCreatedAt,
      });
      const nasObject = new FileStorageObjectEntity({
        id: 'nas-1',
        fileId: 'file-1',
        storageType: StorageType.NAS,
        objectKey: '/test/20240101000000__test.txt', // NAS 실제 경로 (타임스탬프 포함)
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        accessCount: 0,
        leaseCount: 0,
        createdAt: new Date(),
      });
      const folder = new FolderEntity({
        id: 'folder-1',
        name: 'test',
        parentId: null,
        path: '/test',
        state: FolderState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFileDomainService.잠금조회.mockResolvedValue(file);
      mockFileNasStorageDomainService.잠금조회.mockResolvedValue(nasObject);
      mockFileNasStorageDomainService.조회.mockResolvedValue(nasObject);
      mockFolderDomainService.조회.mockResolvedValue(folder);
      mockFileDomainService.저장.mockResolvedValue(file);
      mockTrashDomainService.파일메타생성.mockResolvedValue(undefined);
      mockFileNasStorageDomainService.저장.mockResolvedValue(nasObject);
      mockSyncEventDomainService.저장.mockResolvedValue(undefined);
      mockJobQueue.addJob.mockResolvedValue(undefined);

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      await service.delete('file-1', 'user-1');

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      // trashPath에 NAS 실제 파일명(타임스탬프 포함)이 사용되어야 함
      expect(mockJobQueue.addJob).toHaveBeenCalledWith(
        'NAS_FILE_SYNC',
        expect.objectContaining({
          fileId: 'file-1',
          action: 'trash',
          // trashPath는 .trash/{trashMetadataId}__{NAS실제파일명} 형식
          // NAS 파일명: 20240101000000__test.txt (타임스탬프 포함)
          trashPath: expect.stringMatching(/\.trash\/mock-uuid__20240101000000__test\.txt/),
        }),
      );
    });
  });
});
