/**
 * ============================================================
 * 📦 파일 업로드 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FileUploadService.upload
 *   - FileUploadService.uploadMany
 *
 * 📋 비즈니스 맥락:
 *   - 문서 기준: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 *   - FLOW 1-1: POST /files/upload 일반 업로드
 *   - 동일 이름 파일도 등록일(createdAt)이 다르면 별도 파일로 취급
 *
 * ⚠️ 중요 고려사항:
 *   - 폴더 존재 확인 + NAS 상태 체크
 *   - 중복 검증 시 createdAt이 포함되어야 함
 *   - 폴더 SYNCING/MOVING → 409 FOLDER_SYNC_IN_PROGRESS
 *   - 폴더 ERROR → 500 FOLDER_SYNC_FAILED
 * ============================================================
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { FileUploadService } from './file-upload.service';
import { ConflictStrategy, FileEntity, StorageType } from '../../domain/file';
import { FolderEntity, FolderState, FolderAvailabilityStatus, FolderStorageObjectEntity } from '../../domain/folder';
import { NotFoundException } from '@nestjs/common';
describe('FileUploadService', () => {
  /**
   * 🎭 Mock 설정
   * 📍 Domain Services Mock
   */
  const mockFileDomainService = {
    조회: jest.fn(),
    중복확인: jest.fn(),
    생성: jest.fn(),
    저장: jest.fn(),
  };
  const mockFolderDomainService = {
    조회: jest.fn(),
    루트폴더조회: jest.fn(),
  };
  const mockSyncEventDomainService = {
    저장: jest.fn(),
  };
  const mockFileCacheStorageDomainService = {
    생성: jest.fn(),
  };
  const mockFileNasStorageDomainService = {
    생성: jest.fn(),
  };
  const mockFolderNasStorageObjectDomainService = {
    조회: jest.fn(),
  };
  const mockCacheStorage = {
    파일쓰기: jest.fn(),
  };
  const mockJobQueue = {
    addJob: jest.fn(),
  };
  const mockAuditLogHelper = {
    logFileUpload: jest.fn(),
  };

  let service: FileUploadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileUploadService(
      mockFileDomainService as any,
      mockFolderDomainService as any,
      mockSyncEventDomainService as any,
      mockFileCacheStorageDomainService as any,
      mockFileNasStorageDomainService as any,
      mockFolderNasStorageObjectDomainService as any,
      mockCacheStorage as any,
      mockJobQueue as any,
      mockAuditLogHelper as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * 📌 테스트 시나리오: 동일 이름 파일이 존재하지만 createdAt이 다른 경우
   *
   * 🎯 검증 목적:
   *   - 문서 정책(파일명 + 등록일자) 기준을 반영하여
   *     불필요한 DUPLICATE 오류를 방지한다.
   *
   * ✅ 기대 결과:
   *   - ConflictException 없이 업로드 성공
   */
  it('동일 이름이 있어도 createdAt이 다르면 업로드를 허용한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const existingCreatedAt = new Date('2024-01-01T00:00:00Z');
    const uploadCreatedAt = new Date('2024-01-02T00:00:00Z');
    jest.useFakeTimers().setSystemTime(uploadCreatedAt);

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
        return createdAt.getTime() === existingCreatedAt.getTime();
      },
    );

    mockFileDomainService.생성.mockImplementation((file: FileEntity) => file);
    mockFileNasStorageDomainService.생성.mockResolvedValue(undefined);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockCacheStorage.파일쓰기.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);

    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: uploadCreatedAt,
      updatedAt: uploadCreatedAt,
    });
    mockFolderDomainService.조회.mockResolvedValue(folder);

    const file = {
      originalname: '111.txt',
      mimetype: 'text/plain',
      size: 10,
      buffer: Buffer.from('a'),
    } as Express.Multer.File;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.upload({
      file,
      folderId: 'folder-1',
      conflictStrategy: ConflictStrategy.ERROR,
    });

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result.name).toBe('111.txt');
    expect(result.storageStatus.cache).toBe('AVAILABLE');
    expect(result.storageStatus.nas).toBe('SYNCING');
  });

  /**
   * 📌 테스트 시나리오: 업로드 시 NAS objectKey 생성 규칙
   *
   * 🎯 검증 목적:
   *   - 문서 규칙(YYYYMMDDHHmmss__파일명)을 준수해야 함
   *
   * ✅ 기대 결과:
   *   - NAS 스토리지 객체 objectKey가 규칙을 만족
   */
  it('업로드 시 NAS objectKey가 타임스탬프__파일명 형식이어야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const uploadCreatedAt = new Date('2024-01-02T12:34:56Z');
    jest.useFakeTimers().setSystemTime(uploadCreatedAt);

    mockFileDomainService.중복확인.mockResolvedValue(false);
    mockFileDomainService.생성.mockImplementation((file: FileEntity) => file);
    mockFileNasStorageDomainService.생성.mockResolvedValue(undefined);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockCacheStorage.파일쓰기.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);

    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: uploadCreatedAt,
      updatedAt: uploadCreatedAt,
    });
    mockFolderDomainService.조회.mockResolvedValue(folder);

    const file = {
      originalname: '111.txt',
      mimetype: 'text/plain',
      size: 10,
      buffer: Buffer.from('a'),
    } as Express.Multer.File;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.upload({
      file,
      folderId: 'folder-1',
      conflictStrategy: ConflictStrategy.ERROR,
    });

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    // Domain Service는 createdAt과 fileName을 받아 내부에서 objectKey를 생성함
    expect(mockFileNasStorageDomainService.생성).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'mock-uuid',
        createdAt: uploadCreatedAt,
        fileName: '111.txt',
      }),
    );
  });

  /**
   * 📌 테스트 시나리오: 업로드 시 큐 등록 payload 정합성
   *
   * 🎯 검증 목적:
   *   - syncEventId가 큐에 전달되어야 함
   *
   * ✅ 기대 결과:
   *   - addJob에 syncEventId 포함
   */
  it('업로드 시 큐 등록에 syncEventId가 포함되어야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const uploadCreatedAt = new Date('2024-01-02T12:34:56Z');
    jest.useFakeTimers().setSystemTime(uploadCreatedAt);

    mockFileDomainService.중복확인.mockResolvedValue(false);
    mockFileDomainService.생성.mockImplementation((file: FileEntity) => file);
    mockFileNasStorageDomainService.생성.mockResolvedValue(undefined);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockCacheStorage.파일쓰기.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);

    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: uploadCreatedAt,
      updatedAt: uploadCreatedAt,
    });
    mockFolderDomainService.조회.mockResolvedValue(folder);

    const file = {
      originalname: '111.txt',
      mimetype: 'text/plain',
      size: 10,
      buffer: Buffer.from('a'),
    } as Express.Multer.File;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    await service.upload({
      file,
      folderId: 'folder-1',
      conflictStrategy: ConflictStrategy.ERROR,
    });

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(mockJobQueue.addJob).toHaveBeenCalledWith(
      'NAS_FILE_SYNC',
      expect.objectContaining({ syncEventId: 'mock-uuid', action: 'upload' }),
    );
  });

  /**
   * 📌 테스트 시나리오: 폴더 NAS 상태가 동기화 중일 때 업로드 차단
   *
   * 🎯 검증 목적:
   *   - 문서 요구사항: 폴더 NAS 상태가 BUSY/PENDING이면 업로드 차단
   *
   * ✅ 기대 결과:
   *   - ConflictException (FOLDER_SYNC_IN_PROGRESS)
   */
  it('폴더 NAS 상태가 SYNCING이면 업로드를 차단해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const uploadCreatedAt = new Date('2024-01-02T12:34:56Z');
    jest.useFakeTimers().setSystemTime(uploadCreatedAt);

    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: uploadCreatedAt,
      updatedAt: uploadCreatedAt,
    });
    mockFolderDomainService.조회.mockResolvedValue(folder);

    const folderStorage = new FolderStorageObjectEntity({
      id: 'fso-1',
      folderId: 'folder-1',
      storageType: 'NAS',
      objectKey: '/test',
      availabilityStatus: FolderAvailabilityStatus.SYNCING,
      createdAt: uploadCreatedAt,
    });
    mockFolderNasStorageObjectDomainService.조회.mockResolvedValue(folderStorage);

    const file = {
      originalname: '111.txt',
      mimetype: 'text/plain',
      size: 10,
      buffer: Buffer.from('a'),
    } as Express.Multer.File;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(
      service.upload({
        file,
        folderId: 'folder-1',
        conflictStrategy: ConflictStrategy.ERROR,
      }),
    ).rejects.toMatchObject({
      response: { code: 'FOLDER_SYNC_IN_PROGRESS' },
    });
  });

  /**
   * 📌 테스트 시나리오: 존재하지 않는 폴더에 업로드 시도
   *
   * 🎯 검증 목적:
   *   - FLOW 1-1 step 2: 폴더 존재 + NAS 상태 확인
   *
   * ✅ 기대 결과:
   *   - 404 FOLDER_NOT_FOUND 에러 발생
   */
  it('존재하지 않는 폴더에 업로드 시 404 FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    mockFolderDomainService.조회.mockResolvedValue(null);

    const file = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      size: 10,
      buffer: Buffer.from('a'),
    } as Express.Multer.File;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(
      service.upload({
        file,
        folderId: 'non-existent-folder',
        conflictStrategy: ConflictStrategy.ERROR,
      }),
    ).rejects.toMatchObject({
      response: { code: 'FOLDER_NOT_FOUND' },
    });
  });

  /**
   * 📌 테스트 시나리오: TRASHED 상태 폴더에 업로드 시도
   *
   * 🎯 검증 목적:
   *   - 삭제된(휴지통) 폴더에는 업로드 불가
   *
   * ✅ 기대 결과:
   *   - 404 FOLDER_NOT_FOUND 에러 발생
   */
  it('TRASHED 상태 폴더에 업로드 시 404 FOLDER_NOT_FOUND 에러가 발생해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const trashedFolder = new FolderEntity({
      id: 'folder-1',
      name: 'trashed',
      parentId: null,
      path: '/trashed',
      state: FolderState.TRASHED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockFolderDomainService.조회.mockResolvedValue(trashedFolder);

    const file = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      size: 10,
      buffer: Buffer.from('a'),
    } as Express.Multer.File;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(
      service.upload({
        file,
        folderId: 'folder-1',
        conflictStrategy: ConflictStrategy.ERROR,
      }),
    ).rejects.toMatchObject({
      response: { code: 'FOLDER_NOT_FOUND' },
    });
  });

  /**
   * 📌 테스트 시나리오: 폴더 NAS 상태가 ERROR일 때 업로드 차단
   *
   * 🎯 검증 목적:
   *   - 문서 요구사항: ERROR 상태면 500 FOLDER_SYNC_FAILED
   *
   * ✅ 기대 결과:
   *   - InternalServerErrorException (FOLDER_SYNC_FAILED)
   */
  it('폴더 NAS 상태가 ERROR이면 업로드를 차단해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const uploadCreatedAt = new Date('2024-01-02T12:34:56Z');
    jest.useFakeTimers().setSystemTime(uploadCreatedAt);

    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: uploadCreatedAt,
      updatedAt: uploadCreatedAt,
    });
    mockFolderDomainService.조회.mockResolvedValue(folder);

    const folderStorage = new FolderStorageObjectEntity({
      id: 'fso-1',
      folderId: 'folder-1',
      storageType: 'NAS',
      objectKey: '/test',
      availabilityStatus: FolderAvailabilityStatus.ERROR,
      createdAt: uploadCreatedAt,
    });
    mockFolderNasStorageObjectDomainService.조회.mockResolvedValue(folderStorage);

    const file = {
      originalname: '111.txt',
      mimetype: 'text/plain',
      size: 10,
      buffer: Buffer.from('a'),
    } as Express.Multer.File;

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN + ✅ THEN (실행 및 결과 검증)
    // ═══════════════════════════════════════════════════════
    await expect(
      service.upload({
        file,
        folderId: 'folder-1',
        conflictStrategy: ConflictStrategy.ERROR,
      }),
    ).rejects.toMatchObject({
      response: { code: 'FOLDER_SYNC_FAILED' },
    });
  });

  /**
   * 📌 테스트 시나리오: 다중 파일 업로드
   *
   * 🎯 검증 목적:
   *   - 여러 파일을 한 번에 업로드할 수 있어야 함
   *   - 각 파일에 대해 개별적으로 upload 로직이 수행되어야 함
   *
   * ✅ 기대 결과:
   *   - 모든 파일이 정상적으로 업로드되고 결과 배열이 반환됨
   */
  it('다중 파일 업로드 시 모든 파일이 정상적으로 처리되어야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const uploadCreatedAt = new Date('2024-01-02T12:34:56Z');
    jest.useFakeTimers().setSystemTime(uploadCreatedAt);

    mockFileDomainService.중복확인.mockResolvedValue(false);
    mockFileDomainService.생성.mockImplementation((file: FileEntity) => file);
    mockFileNasStorageDomainService.생성.mockResolvedValue(undefined);
    mockSyncEventDomainService.저장.mockResolvedValue(undefined);
    mockCacheStorage.파일쓰기.mockResolvedValue(undefined);
    mockJobQueue.addJob.mockResolvedValue(undefined);

    const folder = new FolderEntity({
      id: 'folder-1',
      name: 'test',
      parentId: null,
      path: '/test',
      state: FolderState.ACTIVE,
      createdAt: uploadCreatedAt,
      updatedAt: uploadCreatedAt,
    });
    mockFolderDomainService.조회.mockResolvedValue(folder);
    mockFolderNasStorageObjectDomainService.조회.mockResolvedValue(null);

    const files = [
      {
        originalname: 'file1.txt',
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('a'),
      } as Express.Multer.File,
      {
        originalname: 'file2.txt',
        mimetype: 'text/plain',
        size: 20,
        buffer: Buffer.from('b'),
      } as Express.Multer.File,
    ];

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const results = await service.uploadMany({
      files,
      folderId: 'folder-1',
      conflictStrategy: ConflictStrategy.ERROR,
    });

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('file1.txt');
    expect(results[1].name).toBe('file2.txt');
    expect(mockFileDomainService.생성).toHaveBeenCalledTimes(2);
    expect(mockJobQueue.addJob).toHaveBeenCalledTimes(2);
  });
});