/**
 * FileController 테스트
 *
 * 문서 기준: docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 *
 * 테스트 목표:
 * 1. 각 API 응답이 문서 명세와 일치하는지 검증
 * 2. 특히 syncEventId가 응답에 포함되는지 검증
 */

// Mock uuid module (must be before imports)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { PassThrough, Writable } from 'stream';
import { FileController } from './file.controller';
import { FileQueryService, FileUploadService, FileDownloadService, FileManageService } from '../../../business/file';
import { ConflictStrategy, FileState } from '../../../domain/file';

/**
 * ============================================================
 * 📦 파일 컨트롤러 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - FileController (업로드/다운로드/관리 API)
 *
 * 📋 비즈니스 맥락:
 *   - 문서 명세에 맞는 응답 구조와 이벤트 처리를 보장한다.
 *
 * 🔗 관련 요구사항:
 *   - docs/000.FLOW/파일/005-1.파일_처리_FLOW.md
 * ============================================================
 */
describe('FileController', () => {
  let controller: FileController;
  let fileQueryService: jest.Mocked<FileQueryService>;
  let fileUploadService: jest.Mocked<FileUploadService>;
  let fileDownloadService: jest.Mocked<FileDownloadService>;
  let fileManageService: jest.Mocked<FileManageService>;

  beforeEach(async () => {
    const mockFileQueryService = {
      getFileInfo: jest.fn(),
      exists: jest.fn(),
      getFileSize: jest.fn(),
      getChecksum: jest.fn(),
    };

    const mockFileUploadService = {
      upload: jest.fn(),
    };

    const mockFileDownloadService = {
      getFileInfo: jest.fn(), // deprecated, delegates to FileQueryService
      download: jest.fn(),
      releaseLease: jest.fn(),
    };

    const mockFileManageService = {
      rename: jest.fn(),
      move: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileQueryService, useValue: mockFileQueryService },
        { provide: FileUploadService, useValue: mockFileUploadService },
        { provide: FileDownloadService, useValue: mockFileDownloadService },
        { provide: FileManageService, useValue: mockFileManageService },
      ],
    }).compile();

    controller = module.get<FileController>(FileController);
    fileQueryService = module.get(FileQueryService);
    fileUploadService = module.get(FileUploadService);
    fileDownloadService = module.get(FileDownloadService);
    fileManageService = module.get(FileManageService);
  });

  /**
   * ============================================================
   * 📦 일반 업로드 응답 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - POST /files/upload
   *
   * 📋 비즈니스 맥락:
   *   - 업로드 후 syncEventId가 포함되어야 NAS 동기화 추적 가능
   * ============================================================
   */
  describe('POST /files/upload - 일반 업로드 (100MB 미만)', () => {
    /**
     * 문서 명세:
     * - 응답: 200 OK (fileId, name, path, syncEventId)
     *
     * sync_events INSERT 후 syncEventId를 반환해야 함
     */
    /**
     * 📌 테스트 시나리오: 업로드 응답에 syncEventId 포함
     *
     * 🎯 검증 목적:
     *   - 비동기 동기화 이벤트를 추적하기 위한 필수 필드 보장
     *
     * ✅ 기대 결과:
     *   - syncEventId 존재 및 값 일치
     */
    it('응답에 syncEventId가 포함되어야 함', async () => {
      // Arrange
      const mockFile = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      const mockResponse = {
        id: 'file-uuid-123',
        name: 'test.txt',
        folderId: 'folder-uuid-456',
        path: '/test/test.txt',
        size: 1024,
        mimeType: 'text/plain',
        storageStatus: { cache: 'AVAILABLE' as const, nas: 'SYNCING' as const },
        createdAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-789', // 문서 요구사항
      };

      fileUploadService.upload.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.upload(mockFile, 'folder-uuid-456');

      // Assert - 문서 명세에 따라 syncEventId가 포함되어야 함
      expect(result).toHaveProperty('syncEventId');
      expect(result.syncEventId).toBe('sync-event-uuid-789');
    });

    /**
     * 📌 테스트 시나리오: 업로드 응답 기본 필드 확인
     *
     * 🎯 검증 목적:
     *   - 클라이언트가 파일 식별/경로 표시를 할 수 있도록 보장
     *
     * ✅ 기대 결과:
     *   - id, name, path 포함
     */
    it('응답에 id, name, path가 포함되어야 함', async () => {
      // Arrange
      const mockFile = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('pdf content'),
      } as Express.Multer.File;

      const mockResponse = {
        id: 'file-uuid-123',
        name: 'document.pdf',
        folderId: 'folder-uuid-456',
        path: '/documents/document.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        storageStatus: { cache: 'AVAILABLE' as const, nas: 'SYNCING' as const },
        createdAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-789',
      };

      fileUploadService.upload.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.upload(mockFile, 'folder-uuid-456');

      // Assert - 문서 명세: 200 OK (fileId, name, path, syncEventId)
      expect(result.id).toBe('file-uuid-123');
      expect(result.name).toBe('document.pdf');
      expect(result.path).toBe('/documents/document.pdf');
    });
  });

  /**
   * ============================================================
   * 📦 다중 파일 업로드 응답 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - POST /files/upload/many
   *
   * 📋 비즈니스 맥락:
   *   - 여러 파일을 한 번에 업로드하고 결과를 배열로 반환
   * ============================================================
   */
  describe('POST /files/upload/many - 다중 파일 업로드', () => {
    /**
     * 📌 테스트 시나리오: 다중 파일 업로드 응답 확인
     *
     * 🎯 검증 목적:
     *   - 여러 파일이 정상적으로 처리되고 결과 배열이 반환되는지 확인
     *
     * ✅ 기대 결과:
     *   - 결과 배열의 길이가 입력 파일 수와 동일
     *   - 각 결과에 필수 필드 포함
     */
    it('다중 파일 업로드 시 결과 배열을 반환해야 함', async () => {
      // Arrange
      const mockFiles = [
        {
          originalname: 'file1.txt',
          mimetype: 'text/plain',
          size: 1024,
          buffer: Buffer.from('test1'),
        } as Express.Multer.File,
        {
          originalname: 'file2.txt',
          mimetype: 'text/plain',
          size: 2048,
          buffer: Buffer.from('test2'),
        } as Express.Multer.File,
      ];

      const mockResponses = [
        {
          id: 'file-uuid-1',
          name: 'file1.txt',
          folderId: 'folder-uuid-456',
          path: '/test/file1.txt',
          size: 1024,
          mimeType: 'text/plain',
          storageStatus: { cache: 'AVAILABLE' as const, nas: 'SYNCING' as const },
          createdAt: new Date().toISOString(),
          syncEventId: 'sync-event-uuid-1',
        },
        {
          id: 'file-uuid-2',
          name: 'file2.txt',
          folderId: 'folder-uuid-456',
          path: '/test/file2.txt',
          size: 2048,
          mimeType: 'text/plain',
          storageStatus: { cache: 'AVAILABLE' as const, nas: 'SYNCING' as const },
          createdAt: new Date().toISOString(),
          syncEventId: 'sync-event-uuid-2',
        },
      ];

      // @ts-ignore
      fileUploadService.uploadMany = jest.fn().mockResolvedValue(mockResponses);

      // Act
      // @ts-ignore
      const result = await controller.uploadMany(mockFiles, 'folder-uuid-456');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('file1.txt');
      expect(result[1].name).toBe('file2.txt');
      // @ts-ignore
      expect(fileUploadService.uploadMany).toHaveBeenCalledWith({
        files: mockFiles,
        folderId: 'folder-uuid-456',
        conflictStrategy: undefined,
      });
    });
  });

  /**
   * ============================================================
   * 📦 파일명 변경 응답 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - PUT /files/:fileId/rename
   *
   * 📋 비즈니스 맥락:
   *   - 파일명 변경은 NAS 동기화 이벤트와 연결되어야 한다.
   * ============================================================
   */
  describe('PUT /files/:fileId/rename - 파일명 변경', () => {
    /**
     * 문서 명세:
     * - 응답: 200 OK (id, name, path, syncEventId)
     *
     * sync_events INSERT (eventType:RENAME, status:PENDING) 후 syncEventId 반환
     */
    /**
     * 📌 테스트 시나리오: rename 응답에 syncEventId 포함
     *
     * 🎯 검증 목적:
     *   - rename 동기화 작업 추적 가능성 보장
     *
     * ✅ 기대 결과:
     *   - syncEventId 존재 및 값 일치
     */
    it('응답에 syncEventId가 포함되어야 함', async () => {
      // Arrange
      const mockResponse = {
        id: 'file-uuid-123',
        name: 'renamed.txt',
        path: '/test/renamed.txt',
        storageStatus: { nas: 'SYNCING' as const },
        updatedAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-rename-001', // 문서 요구사항
      };

      fileManageService.rename.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.rename('file-uuid-123', { newName: 'renamed.txt' });

      // Assert
      expect(result).toHaveProperty('syncEventId');
      expect(result.syncEventId).toBe('sync-event-uuid-rename-001');
    });

    /**
     * 📌 테스트 시나리오: rename 응답 기본 필드 확인
     *
     * 🎯 검증 목적:
     *   - 변경된 파일명을 화면에 반영하기 위한 필수 정보 보장
     *
     * ✅ 기대 결과:
     *   - id, name, path 포함
     */
    it('응답에 id, name, path가 포함되어야 함', async () => {
      // Arrange
      const mockResponse = {
        id: 'file-uuid-123',
        name: 'newname.txt',
        path: '/folder/newname.txt',
        storageStatus: { nas: 'SYNCING' as const },
        updatedAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-rename-001',
      };

      fileManageService.rename.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.rename('file-uuid-123', { newName: 'newname.txt' });

      // Assert
      expect(result.id).toBe('file-uuid-123');
      expect(result.name).toBe('newname.txt');
      expect(result.path).toBe('/folder/newname.txt');
    });
  });

  /**
   * ============================================================
   * 📦 파일 이동 응답 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - POST /files/:fileId/move
   *
   * 📋 비즈니스 맥락:
   *   - 이동 작업은 NAS 동기화 이벤트와 연결되어야 한다.
   * ============================================================
   */
  describe('POST /files/:fileId/move - 파일 이동', () => {
    /**
     * 문서 명세:
     * - 응답: 200 OK (id, name, folderId, path, syncEventId)
     *
     * sync_events INSERT (eventType:MOVE, status:PENDING) 후 syncEventId 반환
     */
    /**
     * 📌 테스트 시나리오: move 응답에 syncEventId 포함
     *
     * 🎯 검증 목적:
     *   - 이동 동기화 작업 추적 가능성 보장
     *
     * ✅ 기대 결과:
     *   - syncEventId 존재 및 값 일치
     */
    it('응답에 syncEventId가 포함되어야 함', async () => {
      // Arrange
      const mockResponse = {
        id: 'file-uuid-123',
        name: 'test.txt',
        folderId: 'target-folder-uuid',
        path: '/target/test.txt',
        storageStatus: { nas: 'SYNCING' as const },
        updatedAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-move-001', // 문서 요구사항
      };

      fileManageService.move.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.move('file-uuid-123', { targetFolderId: 'target-folder-uuid' });

      // Assert
      expect(result).toHaveProperty('syncEventId');
      expect(result.syncEventId).toBe('sync-event-uuid-move-001');
    });

    /**
     * 📌 테스트 시나리오: move 응답 기본 필드 확인
     *
     * 🎯 검증 목적:
     *   - 이동 후 경로/폴더 정보가 정확히 반영되어야 함
     *
     * ✅ 기대 결과:
     *   - id, name, folderId, path 포함
     */
    it('응답에 id, name, folderId, path가 포함되어야 함', async () => {
      // Arrange
      const mockResponse = {
        id: 'file-uuid-123',
        name: 'test.txt',
        folderId: 'new-folder-uuid',
        path: '/newfolder/test.txt',
        storageStatus: { nas: 'SYNCING' as const },
        updatedAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-move-001',
      };

      fileManageService.move.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.move('file-uuid-123', { targetFolderId: 'new-folder-uuid' });

      // Assert
      expect(result.id).toBe('file-uuid-123');
      expect(result.name).toBe('test.txt');
      expect(result.folderId).toBe('new-folder-uuid');
      expect(result.path).toBe('/newfolder/test.txt');
    });
  });

  /**
   * ============================================================
   * 📦 파일 다운로드 컨트롤러 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - FileController.download
   *
   * 📋 비즈니스 맥락:
   *   - 스트림 종료 이벤트에서 lease 해제를 보장해야 한다.
   * ============================================================
   */
  describe('GET /files/:fileId/download - 파일 다운로드', () => {
    /**
     * 📌 테스트 시나리오: 스트림 close 이벤트에서 lease 해제
     *
     * 🎯 검증 목적:
     *   - 문서 요구사항: close/end/error 모두 lease 해제 필요
     *
     * ✅ 기대 결과:
     *   - close 이벤트 발생 시 releaseLease 호출
     */
    it('스트림 close 이벤트에서도 lease를 해제해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fileId = 'file-1';
      const stream = new PassThrough();
      const file = {
        id: fileId,
        name: 'test.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
      } as any;

      fileDownloadService.download.mockResolvedValue({ file, stream, storageObject: {} as any });
      fileDownloadService.releaseLease.mockResolvedValue(undefined);

      const res = new Writable({
        write(_chunk, _enc, callback) {
          callback();
        },
      }) as any;
      res.set = jest.fn();
      res.end = jest.fn();

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const promise = controller.download(fileId, res);
      await new Promise(resolve => setImmediate(resolve));
      stream.emit('close');
      await promise;
      await new Promise(resolve => setImmediate(resolve));

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(fileDownloadService.releaseLease).toHaveBeenCalledWith(fileId);
    });
  });

  /**
   * ============================================================
   * 📦 파일 삭제(휴지통) 응답 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - DELETE /files/:fileId
   *
   * 📋 비즈니스 맥락:
   *   - 삭제는 TRASH 상태 + syncEventId 반환이 필요
   * ============================================================
   */
  describe('DELETE /files/:fileId - 파일 삭제 (휴지통)', () => {
    /**
     * 문서 명세:
     * - 응답: 200 OK (id, name, state=TRASHED, syncEventId)
     *
     * sync_events INSERT (eventType:TRASH, status:PENDING) 후 syncEventId 반환
     */
    /**
     * 📌 테스트 시나리오: delete 응답에 syncEventId 포함
     *
     * 🎯 검증 목적:
     *   - 휴지통 이동 동기화 작업 추적 보장
     *
     * ✅ 기대 결과:
     *   - syncEventId 존재 및 값 일치
     */
    it('응답에 syncEventId가 포함되어야 함', async () => {
      // Arrange
      const mockResponse = {
        id: 'file-uuid-123',
        name: 'deleted.txt',
        state: FileState.TRASHED,
        trashedAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-trash-001', // 문서 요구사항
      };

      fileManageService.delete.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.delete('file-uuid-123');

      // Assert
      expect(result).toHaveProperty('syncEventId');
      expect(result.syncEventId).toBe('sync-event-uuid-trash-001');
    });

    /**
     * 📌 테스트 시나리오: delete 응답 기본 필드 확인
     *
     * 🎯 검증 목적:
     *   - UI에서 휴지통 상태 표시를 위한 필수 정보 보장
     *
     * ✅ 기대 결과:
     *   - id, name, state=TRASHED 포함
     */
    it('응답에 id, name, state=TRASHED가 포함되어야 함', async () => {
      // Arrange
      const mockResponse = {
        id: 'file-uuid-123',
        name: 'deleted.txt',
        state: FileState.TRASHED,
        trashedAt: new Date().toISOString(),
        syncEventId: 'sync-event-uuid-trash-001',
      };

      fileManageService.delete.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.delete('file-uuid-123');

      // Assert
      expect(result.id).toBe('file-uuid-123');
      expect(result.name).toBe('deleted.txt');
      expect(result.state).toBe(FileState.TRASHED);
    });
  });
});
