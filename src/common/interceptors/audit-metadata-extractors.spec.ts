/**
 * AuditMetadataExtractors 테스트
 *
 * 각 파일 액션별 메타데이터 추출 함수가
 * request/response에서 최대한 풍부한 정보를 올바르게 추출하는지 검증
 *
 * TDD RED 단계: 구현 전에 먼저 테스트 작성
 */

import {
  extractUploadMetadata,
  extractUploadManyMetadata,
  extractDownloadMetadata,
  extractRenameMetadata,
  extractMoveMetadata,
  extractDeleteMetadata,
} from './audit-metadata-extractors';
import { FileState } from '../../domain/file/type/file.type';

// ──────────────────────────────────────────────
// 헬퍼: Express Request 모킹
// ──────────────────────────────────────────────

function mockRequest(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  file?: Partial<Express.Multer.File>;
  files?: Partial<Express.Multer.File>[];
} = {}): any {
  return {
    params: overrides.params || {},
    query: overrides.query || {},
    body: overrides.body || {},
    headers: overrides.headers || {},
    file: overrides.file || undefined,
    files: overrides.files || undefined,
  };
}

// ══════════════════════════════════════════════
//  FILE_UPLOAD (단일)
// ══════════════════════════════════════════════

describe('extractUploadMetadata', () => {
  const uploadResponse = {
    id: 'file-uuid-123',
    name: 'report.pdf',
    folderId: 'folder-uuid-456',
    path: '/documents/report.pdf',
    size: 2048576,
    mimeType: 'application/pdf',
    storageStatus: { cache: 'AVAILABLE' as const, nas: 'SYNCING' as const },
    createdBy: 'user-uuid-001',
    checksum: 'abc123sha256',
    createdAt: '2025-02-10T09:00:00.000Z',
    syncEventId: 'sync-uuid-789',
  };

  it('응답에서 파일 크기, MIME 타입, 경로를 추출해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid-456' },
      file: {
        originalname: 'report.pdf',
        size: 2048576,
        mimetype: 'application/pdf',
      },
    });

    const result = extractUploadMetadata(req, uploadResponse);

    expect(result.fileSize).toBe(2048576);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.path).toBe('/documents/report.pdf');
  });

  it('description-builder 호환: metadata.size 키로도 파일 크기를 제공해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid-456' },
      file: { originalname: 'report.pdf', size: 2048576, mimetype: 'application/pdf' },
    });

    const result = extractUploadMetadata(req, uploadResponse);

    // description-builder가 metadata.size로 읽음
    expect(result.size).toBe(2048576);
  });

  it('요청에서 원본 파일명과 대상 폴더를 추출해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid-456' },
      file: {
        originalname: 'report.pdf',
        size: 2048576,
        mimetype: 'application/pdf',
      },
    });

    const result = extractUploadMetadata(req, uploadResponse);

    expect(result.originalName).toBe('report.pdf');
    expect(result.folderId).toBe('folder-uuid-456');
  });

  it('응답에서 syncEventId를 추출해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid-456' },
      file: { originalname: 'test.txt', size: 100, mimetype: 'text/plain' },
    });

    const result = extractUploadMetadata(req, uploadResponse);

    expect(result.syncEventId).toBe('sync-uuid-789');
  });

  it('Multer 파일이 없을 때도 에러 없이 처리해야 함', () => {
    const req = mockRequest({ body: { folderId: 'folder-uuid-456' } });

    const result = extractUploadMetadata(req, uploadResponse);

    expect(result.fileSize).toBe(2048576); // 응답에서 fallback
    expect(result.originalName).toBeUndefined();
  });

  it('응답이 null일 때도 에러 없이 처리해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid-456' },
      file: { originalname: 'test.txt', size: 100, mimetype: 'text/plain' },
    });

    const result = extractUploadMetadata(req, null);

    expect(result.fileSize).toBe(100); // 요청의 Multer 파일에서 fallback
    expect(result.originalName).toBe('test.txt');
  });
});

// ══════════════════════════════════════════════
//  FILE_UPLOAD (다중)
// ══════════════════════════════════════════════

describe('extractUploadManyMetadata', () => {
  const uploadManyResponse = [
    {
      id: 'file-uuid-1',
      name: 'doc1.pdf',
      folderId: 'folder-uuid',
      path: '/docs/doc1.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      storageStatus: { cache: 'AVAILABLE' as const, nas: 'SYNCING' as const },
      createdBy: 'user-uuid-001',
      checksum: 'checksum-1',
      createdAt: '2025-02-10T09:00:00.000Z',
      syncEventId: 'sync-1',
    },
    {
      id: 'file-uuid-2',
      name: 'doc2.xlsx',
      folderId: 'folder-uuid',
      path: '/docs/doc2.xlsx',
      size: 4096,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      storageStatus: { cache: 'AVAILABLE' as const, nas: 'SYNCING' as const },
      createdBy: 'user-uuid-001',
      checksum: 'checksum-2',
      createdAt: '2025-02-10T09:00:00.000Z',
      syncEventId: 'sync-2',
    },
  ];

  it('파일 수와 총 크기를 계산해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid' },
      files: [
        { originalname: 'doc1.pdf', size: 1024, mimetype: 'application/pdf' },
        { originalname: 'doc2.xlsx', size: 4096, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ],
    });

    const result = extractUploadManyMetadata(req, uploadManyResponse);

    expect(result.fileCount).toBe(2);
    expect(result.totalSize).toBe(5120);
  });

  it('description-builder 호환: metadata.size 키로 총 크기를 제공해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid' },
      files: [
        { originalname: 'doc1.pdf', size: 1024, mimetype: 'application/pdf' },
        { originalname: 'doc2.xlsx', size: 4096, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ],
    });

    const result = extractUploadManyMetadata(req, uploadManyResponse);

    // description-builder가 metadata.size로 읽음
    expect(result.size).toBe(5120);
  });

  it('다중 파일 이름을 결합한 targetName을 제공해야 함 (배열 응답 대응)', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid' },
      files: [
        { originalname: 'doc1.pdf', size: 1024, mimetype: 'application/pdf' },
        { originalname: 'doc2.xlsx', size: 4096, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ],
    });

    const result = extractUploadManyMetadata(req, uploadManyResponse);

    // "doc1.pdf 외 1건" 형태로 제공
    expect(result.targetName).toBe('doc1.pdf 외 1건');
  });

  it('단일 파일일 때는 "외 N건" 없이 이름만 제공해야 함', () => {
    const singleResponse = [uploadManyResponse[0]];
    const req = mockRequest({
      body: { folderId: 'folder-uuid' },
      files: [{ originalname: 'doc1.pdf', size: 1024, mimetype: 'application/pdf' }],
    });

    const result = extractUploadManyMetadata(req, singleResponse);

    expect(result.targetName).toBe('doc1.pdf');
  });

  it('각 파일의 요약 정보를 포함해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid' },
      files: [
        { originalname: 'doc1.pdf', size: 1024, mimetype: 'application/pdf' },
        { originalname: 'doc2.xlsx', size: 4096, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ],
    });

    const result = extractUploadManyMetadata(req, uploadManyResponse);

    expect(result.files).toEqual([
      { id: 'file-uuid-1', name: 'doc1.pdf', size: 1024, mimeType: 'application/pdf', checksum: 'checksum-1', createdBy: 'user-uuid-001', syncEventId: 'sync-1' },
      { id: 'file-uuid-2', name: 'doc2.xlsx', size: 4096, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', checksum: 'checksum-2', createdBy: 'user-uuid-001', syncEventId: 'sync-2' },
    ]);
  });

  it('대상 폴더 ID를 추출해야 함', () => {
    const req = mockRequest({
      body: { folderId: 'folder-uuid' },
      files: [],
    });

    const result = extractUploadManyMetadata(req, []);

    expect(result.folderId).toBe('folder-uuid');
  });

  it('응답이 배열이 아닐 때 안전하게 처리해야 함', () => {
    const req = mockRequest({ body: { folderId: 'folder-uuid' }, files: [] });

    const result = extractUploadManyMetadata(req, null);

    expect(result.fileCount).toBe(0);
    expect(result.totalSize).toBe(0);
    expect(result.files).toEqual([]);
  });
});

// ══════════════════════════════════════════════
//  FILE_DOWNLOAD
// ══════════════════════════════════════════════

describe('extractDownloadMetadata', () => {
  it('Range 헤더를 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
      headers: { range: 'bytes=0-1023' },
    });

    const result = extractDownloadMetadata(req, undefined);

    expect(result.rangeRequest).toBe('bytes=0-1023');
    expect(result.isPartialDownload).toBe(true);
  });

  it('Range 헤더 없으면 전체 다운로드로 표시해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
    });

    const result = extractDownloadMetadata(req, undefined);

    expect(result.rangeRequest).toBeUndefined();
    expect(result.isPartialDownload).toBe(false);
  });

  it('fileId를 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
    });

    const result = extractDownloadMetadata(req, undefined);

    expect(result.fileId).toBe('file-uuid-123');
  });
});

// ══════════════════════════════════════════════
//  FILE_RENAME
// ══════════════════════════════════════════════

describe('extractRenameMetadata', () => {
  const renameResponse = {
    id: 'file-uuid-123',
    name: 'new-report.pdf',
    path: '/docs/new-report.pdf',
    size: 2048576,
    mimeType: 'application/pdf',
    createdBy: 'user-uuid-001',
    storageStatus: { nas: 'SYNCING' as const },
    updatedAt: '2025-02-10T10:00:00.000Z',
    syncEventId: 'sync-rename-001',
  };

  it('새 파일명을 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
      body: { newName: 'new-report.pdf' },
    });

    const result = extractRenameMetadata(req, renameResponse);

    expect(result.newName).toBe('new-report.pdf');
  });

  it('응답에서 변경 후 경로와 syncEventId를 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
      body: { newName: 'new-report.pdf' },
    });

    const result = extractRenameMetadata(req, renameResponse);

    expect(result.newPath).toBe('/docs/new-report.pdf');
    expect(result.syncEventId).toBe('sync-rename-001');
  });

  it('응답이 null일 때도 요청 정보만 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
      body: { newName: 'new-report.pdf' },
    });

    const result = extractRenameMetadata(req, null);

    expect(result.newName).toBe('new-report.pdf');
    expect(result.newPath).toBeUndefined();
    expect(result.syncEventId).toBeUndefined();
  });
});

// ══════════════════════════════════════════════
//  FILE_MOVE
// ══════════════════════════════════════════════

describe('extractMoveMetadata', () => {
  const moveResponse = {
    id: 'file-uuid-123',
    name: 'report.pdf',
    folderId: 'target-folder-uuid',
    path: '/target/report.pdf',
    size: 2048576,
    mimeType: 'application/pdf',
    createdBy: 'user-uuid-001',
    storageStatus: { nas: 'SYNCING' as const },
    updatedAt: '2025-02-10T10:00:00.000Z',
    syncEventId: 'sync-move-001',
  };

  it('이동 대상 폴더를 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
      body: { targetFolderId: 'target-folder-uuid' },
    });

    const result = extractMoveMetadata(req, moveResponse);

    expect(result.targetFolderId).toBe('target-folder-uuid');
  });

  it('응답에서 이동 후 경로와 syncEventId를 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
      body: { targetFolderId: 'target-folder-uuid' },
    });

    const result = extractMoveMetadata(req, moveResponse);

    expect(result.newPath).toBe('/target/report.pdf');
    expect(result.newFolderId).toBe('target-folder-uuid');
    expect(result.syncEventId).toBe('sync-move-001');
  });

  it('응답이 null일 때도 요청 정보만 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
      body: { targetFolderId: 'target-folder-uuid' },
    });

    const result = extractMoveMetadata(req, null);

    expect(result.targetFolderId).toBe('target-folder-uuid');
    expect(result.newPath).toBeUndefined();
    expect(result.syncEventId).toBeUndefined();
  });
});

// ══════════════════════════════════════════════
//  FILE_DELETE
// ══════════════════════════════════════════════

describe('extractDeleteMetadata', () => {
  const deleteResponse = {
    id: 'file-uuid-123',
    name: 'old-report.pdf',
    size: 2048576,
    mimeType: 'application/pdf',
    createdBy: 'user-uuid-001',
    path: '/documents/old-report.pdf',
    state: FileState.TRASHED,
    trashedAt: '2025-02-10T11:00:00.000Z',
    syncEventId: 'sync-trash-001',
  };

  it('응답에서 삭제된 파일명, 상태, 삭제 시각을 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
    });

    const result = extractDeleteMetadata(req, deleteResponse);

    expect(result.fileName).toBe('old-report.pdf');
    expect(result.newState).toBe('TRASHED');
    expect(result.trashedAt).toBe('2025-02-10T11:00:00.000Z');
  });

  it('응답에서 syncEventId를 추출해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
    });

    const result = extractDeleteMetadata(req, deleteResponse);

    expect(result.syncEventId).toBe('sync-trash-001');
  });

  it('응답이 null일 때도 에러 없이 빈 메타데이터를 반환해야 함', () => {
    const req = mockRequest({
      params: { fileId: 'file-uuid-123' },
    });

    const result = extractDeleteMetadata(req, null);

    expect(result.fileName).toBeUndefined();
    expect(result.syncEventId).toBeUndefined();
  });
});
