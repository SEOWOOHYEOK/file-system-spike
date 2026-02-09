import { Test, TestingModule } from '@nestjs/testing';

// Mock uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

import { TrashService } from './trash.service';
import {
  RestorePreviewRequest,
  RestorePathStatus,
  RestoreExecuteRequest,
  TrashDomainService,
} from '../../domain/trash';
import {
  FileState,
} from '../../domain/file';
import {
  FolderState,
} from '../../domain/folder';
import { FileDomainService } from '../../domain/file/service/file-domain.service';
import { FolderDomainService } from '../../domain/folder/service/folder-domain.service';
import { SyncEventDomainService } from '../../domain/sync-event/service/sync-event-domain.service';
import { JOB_QUEUE_PORT } from '../../domain/queue/ports/job-queue.port';
import { SyncEventStatus } from '../../domain/sync-event';
import { FileHistoryService } from '../audit/file-history.service';

// Mock Domain Services
const mockTrashDomainService = {
  조회: jest.fn(),
  상세목록조회: jest.fn(),
  전체목록조회: jest.fn(),
  삭제: jest.fn(),
};

const mockFileDomainService = {
  조회: jest.fn(),
  조건조회: jest.fn(),
  중복확인: jest.fn(),
  저장: jest.fn(),
};

const mockFolderDomainService = {
  조회: jest.fn(),
  조건조회: jest.fn(),
  저장: jest.fn(),
};

const mockSyncEventDomainService = {
  아이디목록조회: jest.fn(),
  저장: jest.fn(),
};

const mockJobQueuePort = {
  addJob: jest.fn(),
  getJob: jest.fn(),
};

const mockFileHistoryService = {
  logFileCreated: jest.fn().mockResolvedValue(undefined),
  logFileRestored: jest.fn().mockResolvedValue(undefined),
  logFileDeleted: jest.fn().mockResolvedValue(undefined),
};

describe('TrashService', () => {
  let service: TrashService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashService,
        { provide: TrashDomainService, useValue: mockTrashDomainService },
        { provide: FileDomainService, useValue: mockFileDomainService },
        { provide: FolderDomainService, useValue: mockFolderDomainService },
        { provide: SyncEventDomainService, useValue: mockSyncEventDomainService },
        { provide: JOB_QUEUE_PORT, useValue: mockJobQueuePort },
        { provide: FileHistoryService, useValue: mockFileHistoryService },
      ],
    }).compile();

    service = module.get<TrashService>(TrashService);
    
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('previewRestore', () => {
    it('should return available status when folder exists by pathname', async () => {
      // Given
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash1'] };
      
      // Mock trash metadata
      mockTrashDomainService.조회.mockResolvedValue({
        id: 'trash1',
        fileId: 'file1',
        originalPath: '/projects/2024/report.pdf',  // 파일의 전체 경로
        originalFolderId: 'folder-old',
        isFile: () => true,
        isFolder: () => false,
      });

      // Mock file info
      mockFileDomainService.조회.mockResolvedValue({
        id: 'file1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        deletedAt: new Date(),
      });

      // Mock folder lookup by path (핵심: 부모 폴더 경로로 찾음)
      mockFolderDomainService.조건조회.mockResolvedValue({
        id: 'folder-new',
        path: '/projects/2024/',  // 부모 폴더 경로
        state: FolderState.ACTIVE,
      });

      // Mock conflict check (no conflict)
      mockFileDomainService.중복확인.mockResolvedValue(false);

      // When
      const result = await service.previewRestore(request);

      // Then
      expect(result.items[0]).toEqual(expect.objectContaining({
        trashMetadataId: 'trash1',
        pathStatus: RestorePathStatus.AVAILABLE,
        resolveFolderId: 'folder-new',
        hasConflict: false,
      }));
      expect(result.summary.available).toBe(1);
      
      // 핵심: 부모 폴더 경로로 조회해야 함 (trailing slash 없음)
      expect(mockFolderDomainService.조건조회).toHaveBeenCalledWith({
        path: '/projects/2024',  // 파일명 제외한 부모 폴더 경로
        state: FolderState.ACTIVE,
      });
    });

    it('should find root folder for file in root directory', async () => {
      // Given - 루트 폴더에 있는 파일
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash-root'] };
      
      mockTrashDomainService.조회.mockResolvedValue({
        id: 'trash-root',
        fileId: 'file-root',
        originalPath: '/333.txt',  // 루트 폴더의 파일
        originalFolderId: 'root-folder-id',
        isFile: () => true,
        isFolder: () => false,
      });

      mockFileDomainService.조회.mockResolvedValue({
        id: 'file-root',
        name: '333.txt',
        mimeType: 'text/plain',
        sizeBytes: 9,
      });

      // 루트 폴더 (/) 를 찾아야 함
      mockFolderDomainService.조건조회.mockResolvedValue({
        id: 'root-folder-id',
        path: '/',
        state: FolderState.ACTIVE,
      });

      mockFileDomainService.중복확인.mockResolvedValue(false);

      // When
      const result = await service.previewRestore(request);

      // Then
      expect(result.items[0].pathStatus).toBe(RestorePathStatus.AVAILABLE);
      expect(result.items[0].resolveFolderId).toBe('root-folder-id');
      
      // 핵심: 루트 폴더 경로 "/" 로 조회해야 함
      expect(mockFolderDomainService.조건조회).toHaveBeenCalledWith({
        path: '/',  // 루트 폴더
        state: FolderState.ACTIVE,
      });
    });

    it('should return not found status when folder does not exist', async () => {
      // Given
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash2'] };
      
      mockTrashDomainService.조회.mockResolvedValue({
        id: 'trash2',
        fileId: 'file2',
        originalPath: '/archive/old/',
        originalFolderId: 'folder-deleted',
        isFile: () => true,
        isFolder: () => false,
      });

      mockFileDomainService.조회.mockResolvedValue({
        id: 'file2',
        name: 'old.txt',
      });

      // Mock folder lookup (not found)
      mockFolderDomainService.조건조회.mockResolvedValue(null);

      // When
      const result = await service.previewRestore(request);

      // Then
      expect(result.items[0]).toEqual(expect.objectContaining({
        pathStatus: RestorePathStatus.NOT_FOUND,
        resolveFolderId: null,
      }));
      expect(result.summary.notFound).toBe(1);
    });

    it('should detect conflict when file with same name exists', async () => {
      // Given
      const request: RestorePreviewRequest = { trashMetadataIds: ['trash3'] };
      
      mockTrashDomainService.조회.mockResolvedValue({
        id: 'trash3',
        fileId: 'file3',
        originalPath: '/docs/',
        isFile: () => true,
        isFolder: () => false,
      });

      mockFileDomainService.조회.mockResolvedValue({
        id: 'file3',
        name: 'duplicate.txt',
        mimeType: 'text/plain',
        createdAt: new Date('2024-01-01'),
      });

      mockFolderDomainService.조건조회.mockResolvedValue({
        id: 'folder-exist',
        path: '/docs/',
      });

      // Mock conflict check (conflict exists)
      mockFileDomainService.중복확인.mockResolvedValue(true);

      // When
      const result = await service.previewRestore(request);

      // Then
      expect(result.items[0]).toEqual(expect.objectContaining({
        hasConflict: true,
      }));
      expect(result.summary.conflict).toBe(1);
    });
  });

  describe('getTrashList', () => {
    it('should return mapped trash list with restoreInfo', async () => {
      // Given
      const query = { page: 1, limit: 10 };
      const now = new Date();
      
      mockTrashDomainService.상세목록조회.mockResolvedValue({
        items: [
          {
            type: 'FILE',
            id: 'file1',
            name: 'test.txt',
            sizeBytes: 100,
            mimeType: 'text/plain',
            trashMetadataId: 'trash1',
            originalPath: '/test/',
            deletedAt: now,
            deletedBy: 'user1',
            modifiedAt: now,
            expiresAt: now,
          },
        ],
        totalCount: 1,
        totalSizeBytes: 100,
      });

      // Mock for restoreInfo mapping
      mockFolderDomainService.조건조회.mockResolvedValue({ id: 'folder1' });

      // When
      const result = await service.getTrashList(query);

      // Then
      expect(result.items[0]).toEqual(expect.objectContaining({
        id: 'file1',
        name: 'test.txt',
        restoreInfo: expect.objectContaining({
          pathStatus: RestorePathStatus.AVAILABLE,
          resolveFolderId: 'folder1',
        }),
      }));
      expect(result.totalCount).toBe(1);
    });

    it('should return NOT_FOUND pathStatus when folder does not exist', async () => {
      // Given
      const query = { page: 1, limit: 10 };
      const now = new Date();
      
      mockTrashDomainService.상세목록조회.mockResolvedValue({
        items: [
          {
            type: 'FILE',
            id: 'file1',
            name: 'orphan.txt',
            sizeBytes: 50,
            mimeType: 'text/plain',
            trashMetadataId: 'trash1',
            originalPath: '/deleted-folder/orphan.txt',  // 파일 전체 경로
            deletedAt: now,
            deletedBy: 'user1',
            modifiedAt: now,
            expiresAt: now,
          },
        ],
        totalCount: 1,
        totalSizeBytes: 50,
      });

      // Mock for restoreInfo mapping (folder not found)
      mockFolderDomainService.조건조회.mockResolvedValue(null);

      // When
      const result = await service.getTrashList(query);

      // Then
      expect(result.items[0].restoreInfo).toEqual({
        pathStatus: RestorePathStatus.NOT_FOUND,
        resolveFolderId: null,
      });
      
      // 핵심: 부모 폴더 경로로 조회해야 함 (trailing slash 없음)
      expect(mockFolderDomainService.조건조회).toHaveBeenCalledWith({
        path: '/deleted-folder',  // 파일명 제외
        state: FolderState.ACTIVE,
      });
    });

    it('should extract parent folder path correctly for root folder files', async () => {
      // Given - 루트 폴더에 있던 파일
      const query = { page: 1, limit: 10 };
      const now = new Date();
      
      mockTrashDomainService.상세목록조회.mockResolvedValue({
        items: [
          {
            type: 'FILE',
            id: 'file1',
            name: '333.txt',
            sizeBytes: 9,
            mimeType: 'text/plain',
            trashMetadataId: 'trash1',
            originalPath: '/333.txt',  // 루트 폴더의 파일
            deletedAt: now,
            deletedBy: 'user1',
            modifiedAt: now,
            expiresAt: now,
          },
        ],
        totalCount: 1,
        totalSizeBytes: 9,
      });

      mockFolderDomainService.조건조회.mockResolvedValue({
        id: 'root-folder',
        path: '/',
      });

      // When
      const result = await service.getTrashList(query);

      // Then
      expect(result.items[0].restoreInfo).toEqual({
        pathStatus: RestorePathStatus.AVAILABLE,
        resolveFolderId: 'root-folder',
      });
      
      // 핵심: 루트 폴더 경로 "/" 로 조회해야 함
      expect(mockFolderDomainService.조건조회).toHaveBeenCalledWith({
        path: '/',
        state: FolderState.ACTIVE,
      });
    });
  });

  describe('executeRestore', () => {
    it('should queue restore jobs for items without exclude flag', async () => {
      // Given
      const request: RestoreExecuteRequest = {
        items: [
          { trashMetadataId: 'trash1' },
          { trashMetadataId: 'trash2', targetFolderId: 'custom-folder' },
          { trashMetadataId: 'trash3', exclude: true },
        ],
      };
      const userId = 'user1';

      // Mock trash metadata for trash1 (auto resolve)
      mockTrashDomainService.조회
        .mockResolvedValueOnce({
          id: 'trash1',
          fileId: 'file1',
          originalPath: '/docs/',
          originalFolderId: 'folder1',
          isFile: () => true,
          isFolder: () => false,
          deletedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'trash2',
          fileId: 'file2',
          originalPath: '/archive/',
          originalFolderId: 'folder2',
          isFile: () => true,
          isFolder: () => false,
          deletedAt: new Date(),
        });

      // Mock file info
      mockFileDomainService.조회
        .mockResolvedValueOnce({
          id: 'file1',
          name: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          state: FileState.TRASHED,
          isTrashed: () => true,
        })
        .mockResolvedValueOnce({
          id: 'file2',
          name: 'archive.zip',
          mimeType: 'application/zip',
          sizeBytes: 2048,
          state: FileState.TRASHED,
          isTrashed: () => true,
        });

      // Mock folder lookup (for auto resolve)
      mockFolderDomainService.조건조회.mockResolvedValue({ id: 'resolved-folder', path: '/docs/' });
      mockFolderDomainService.조회.mockResolvedValue({ id: 'custom-folder', path: '/custom/' });

      // Mock conflict check (no conflicts)
      mockFileDomainService.중복확인.mockResolvedValue(false);

      // Mock sync event save
      mockSyncEventDomainService.저장.mockResolvedValue(undefined);

      // Mock job queue
      mockJobQueuePort.addJob
        .mockResolvedValueOnce({ id: 'job1', queueName: 'file-restore', status: 'waiting' })
        .mockResolvedValueOnce({ id: 'job2', queueName: 'file-restore', status: 'waiting' });

      // When
      const result = await service.executeRestore(request, userId);

      // Then
      expect(result.queued).toBe(2);
      expect(result.excluded).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.syncEventIds).toHaveLength(2);
      expect(mockJobQueuePort.addJob).toHaveBeenCalledTimes(2);
    });

    it('should skip items with conflicts and report them', async () => {
      // Given
      const request: RestoreExecuteRequest = {
        items: [{ trashMetadataId: 'trash-conflict' }],
      };
      const userId = 'user1';

      mockTrashDomainService.조회.mockResolvedValue({
        id: 'trash-conflict',
        fileId: 'file-conflict',
        originalPath: '/docs/',
        isFile: () => true,
        isFolder: () => false,
        deletedAt: new Date(),
      });

      mockFileDomainService.조회.mockResolvedValue({
        id: 'file-conflict',
        name: 'conflict.pdf',
        mimeType: 'application/pdf',
        createdAt: new Date(),
        state: FileState.TRASHED,
        isTrashed: () => true,
      });

      mockFolderDomainService.조건조회.mockResolvedValue({ id: 'target-folder' });

      // Mock conflict exists
      mockFileDomainService.중복확인.mockResolvedValue(true);

      // When
      const result = await service.executeRestore(request, userId);

      // Then
      expect(result.queued).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.skippedItems).toHaveLength(1);
      expect(result.skippedItems[0].reason).toBe('CONFLICT');
    });

    it('should return error when path not found and no targetFolderId provided', async () => {
      // Given
      const request: RestoreExecuteRequest = {
        items: [{ trashMetadataId: 'trash-no-path' }],
      };
      const userId = 'user1';

      mockTrashDomainService.조회.mockResolvedValue({
        id: 'trash-no-path',
        fileId: 'file-no-path',
        originalPath: '/deleted-folder/',
        isFile: () => true,
        isFolder: () => false,
        deletedAt: new Date(),
      });

      mockFileDomainService.조회.mockResolvedValue({
        id: 'file-no-path',
        name: 'orphan.txt',
        state: FileState.TRASHED,
        isTrashed: () => true,
      });

      // Folder not found
      mockFolderDomainService.조건조회.mockResolvedValue(null);

      // When
      const result = await service.executeRestore(request, userId);

      // Then
      expect(result.queued).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.skippedItems[0].reason).toBe('PATH_NOT_FOUND');
    });
  });

  describe('purgeFile', () => {
    it('should queue purge job without immediately changing file state', async () => {
      // Given
      const trashMetadataId = 'trash-to-purge';
      const userId = 'user1';
      const permanentDeleteMock = jest.fn();

      mockTrashDomainService.조회.mockResolvedValue({
        id: trashMetadataId,
        fileId: 'file-to-purge',
        isFile: () => true,
        isFolder: () => false,
      });

      mockFileDomainService.조회.mockResolvedValue({
        id: 'file-to-purge',
        name: 'delete-me.txt',
        state: 'TRASHED',
        isTrashed: () => true,
        permanentDelete: permanentDeleteMock,
      });

      mockJobQueuePort.addJob.mockResolvedValue({ id: 'job1' });

      // When
      const result = await service.purgeFile(trashMetadataId, userId);

      // Then
      expect(result.id).toBe('file-to-purge');
      expect(result.name).toBe('delete-me.txt');
      expect(result.type).toBe('FILE');
      
      // permanentDelete()가 즉시 호출되고, 저장됨
      expect(permanentDeleteMock).toHaveBeenCalled();
      expect(mockFileDomainService.저장).toHaveBeenCalled();
      
      // 휴지통 메타데이터도 삭제됨
      expect(mockTrashDomainService.삭제).toHaveBeenCalledWith(trashMetadataId);
      
      // job이 큐에 추가되어야 함 (캐시/NAS 스토리지 삭제)
      expect(mockJobQueuePort.addJob).toHaveBeenCalledWith(
        'NAS_FILE_SYNC',
        expect.objectContaining({
          fileId: 'file-to-purge',
          action: 'purge',
          trashMetadataId,
        }),
      );
    });

    it('should throw error when trash item not found', async () => {
      // Given
      mockTrashDomainService.조회.mockResolvedValue(null);

      // When & Then
      await expect(service.purgeFile('non-existent', 'user1'))
        .rejects.toThrow();
    });
  });

  describe('purge (folder)', () => {
    it('should queue purge job for folder without immediately changing folder state', async () => {
      // Given
      const trashMetadataId = 'trash-folder-to-purge';
      const userId = 'user1';
      const permanentDeleteMock = jest.fn();

      mockTrashDomainService.조회.mockResolvedValue({
        id: trashMetadataId,
        folderId: 'folder-to-purge',
        fileId: null, // fileId가 없어야 isFile()에서 file 조회 안함
        isFile: () => false,
        isFolder: () => true,
      });

      mockFolderDomainService.조회.mockResolvedValue({
        id: 'folder-to-purge',
        name: 'folder-to-delete',
        state: 'TRASHED',
        isTrashed: () => true,
        permanentDelete: permanentDeleteMock,
      });

      mockJobQueuePort.addJob.mockResolvedValue({ id: 'job1' });

      // When
      const result = await service.purge(trashMetadataId, userId);

      // Then
      expect(result.id).toBe('folder-to-purge');
      expect(result.name).toBe('folder-to-delete');
      expect(result.type).toBe('FOLDER');
      
      // permanentDelete()가 즉시 호출되고, 저장됨
      expect(permanentDeleteMock).toHaveBeenCalled();
      expect(mockFolderDomainService.저장).toHaveBeenCalled();
      
      // 휴지통 메타데이터도 삭제됨
      expect(mockTrashDomainService.삭제).toHaveBeenCalledWith(trashMetadataId);
      
      // job이 큐에 추가되어야 함 (NAS 스토리지 삭제)
      expect(mockJobQueuePort.addJob).toHaveBeenCalledWith(
        'NAS_FOLDER_SYNC',
        expect.objectContaining({
          folderId: 'folder-to-purge',
          action: 'purge',
          trashMetadataId,
        }),
      );
    });
  });

  describe('emptyTrash', () => {
    it('should purge all trash items and return stats', async () => {
      // Given
      const userId = 'user1';

      const trashItem1 = { id: 'trash1', fileId: 'file1', isFile: () => true, isFolder: () => false };
      const trashItem2 = { id: 'trash2', fileId: 'file2', isFile: () => true, isFolder: () => false };

      mockTrashDomainService.전체목록조회.mockResolvedValue([trashItem1, trashItem2]);

      // Mock 조회 for both purgeFile calls (called within emptyTrash -> purgeFile)
      mockTrashDomainService.조회
        .mockResolvedValueOnce(trashItem1)
        .mockResolvedValueOnce(trashItem2);

      mockFileDomainService.조회
        .mockResolvedValueOnce({
          id: 'file1',
          name: 'file1.txt',
          isTrashed: () => true,
          permanentDelete: jest.fn(),
        })
        .mockResolvedValueOnce({
          id: 'file2',
          name: 'file2.txt',
          isTrashed: () => true,
          permanentDelete: jest.fn(),
        });

      mockFileDomainService.저장.mockResolvedValue({});
      mockTrashDomainService.삭제.mockResolvedValue(undefined);

      // When
      const result = await service.emptyTrash(userId);

      // Then
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('getRestoreStatus', () => {
    it('should return aggregated status for sync events', async () => {
      // Given
      const syncEventIds = ['sync1', 'sync2', 'sync3'];
      const now = new Date();

      mockSyncEventDomainService.아이디목록조회.mockResolvedValue([
        {
          id: 'sync1',
          status: SyncEventStatus.DONE,
          fileId: 'file1',
          metadata: { fileName: 'file1.txt' },
          createdAt: now,
          processedAt: now,
        },
        {
          id: 'sync2',
          status: SyncEventStatus.PROCESSING,
          fileId: 'file2',
          metadata: { fileName: 'file2.txt' },
          createdAt: now,
        },
        {
          id: 'sync3',
          status: SyncEventStatus.PENDING,
          fileId: 'file3',
          metadata: { fileName: 'file3.txt' },
          createdAt: now,
        },
      ]);

      // When
      const result = await service.getRestoreStatus(syncEventIds);

      // Then
      expect(result.summary).toEqual({
        total: 3,
        pending: 1,
        processing: 1,
        done: 1,
        failed: 0,
      });
      expect(result.isCompleted).toBe(false);
      expect(result.items).toHaveLength(3);
    });

    it('should return isCompleted=true when all events are done or failed', async () => {
      // Given
      const syncEventIds = ['sync1', 'sync2'];
      const now = new Date();

      mockSyncEventDomainService.아이디목록조회.mockResolvedValue([
        {
          id: 'sync1',
          status: SyncEventStatus.DONE,
          fileId: 'file1',
          metadata: { fileName: 'file1.txt' },
          createdAt: now,
          processedAt: now,
        },
        {
          id: 'sync2',
          status: SyncEventStatus.FAILED,
          fileId: 'file2',
          metadata: { fileName: 'file2.txt' },
          createdAt: now,
          errorMessage: 'NAS error',
        },
      ]);

      // When
      const result = await service.getRestoreStatus(syncEventIds);

      // Then
      expect(result.summary).toEqual({
        total: 2,
        pending: 0,
        processing: 0,
        done: 1,
        failed: 1,
      });
      expect(result.isCompleted).toBe(true);
    });

    it('should return empty result for empty syncEventIds', async () => {
      // Given
      const syncEventIds: string[] = [];

      // When
      const result = await service.getRestoreStatus(syncEventIds);

      // Then
      expect(result.summary.total).toBe(0);
      expect(result.isCompleted).toBe(true);
      expect(result.items).toHaveLength(0);
    });
  });
});
