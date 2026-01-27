import { Test, TestingModule } from '@nestjs/testing';

// Mock uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { TrashController } from './trash.controller';
import { TrashService } from '../../business/trash';
import {
  TrashListQuery,
  RestorePreviewRequest,
  RestoreExecuteRequest,
  TrashListResponse,
  RestorePreviewResponse,
  RestoreExecuteResponse,
  RestoreStatusResponse,
  EmptyTrashResponse,
  RestorePathStatus,
} from '../../domain/trash';

// Mock Service
const mockTrashService = {
  getTrashList: jest.fn(),
  previewRestore: jest.fn(),
  executeRestore: jest.fn(),
  getRestoreStatus: jest.fn(),
  purgeFile: jest.fn(),
  emptyTrash: jest.fn(),
};

describe('TrashController', () => {
  let controller: TrashController;
  let service: typeof mockTrashService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrashController],
      providers: [
        {
          provide: TrashService,
          useValue: mockTrashService,
        },
      ],
    }).compile();

    controller = module.get<TrashController>(TrashController);
    service = module.get(TrashService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTrashList', () => {
    it('should return trash list', async () => {
      const query: TrashListQuery = { page: 1, limit: 10 };
      const result: TrashListResponse = {
        items: [],
        totalCount: 0,
        totalSizeBytes: 0,
        pagination: {
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
        appliedFilters: {},
      };

      service.getTrashList.mockResolvedValue(result);

      expect(await controller.getTrashList(query)).toBe(result);
      expect(service.getTrashList).toHaveBeenCalledWith(query);
    });
  });

  describe('previewRestore', () => {
    it('should return restore preview', async () => {
      const request: RestorePreviewRequest = { trashMetadataIds: ['id1'] };
      const result: RestorePreviewResponse = {
        totalCount: 1,
        items: [
          {
            trashMetadataId: 'id1',
            fileId: 'file1',
            fileName: 'test.txt',
            mimeType: 'text/plain',
            sizeBytes: 100,
            deletedAt: new Date(),
            pathStatus: RestorePathStatus.AVAILABLE,
            originalPath: '/test/',
            originalFolderId: 'folder1',
            resolveFolderId: 'folder1-new',
            hasConflict: false,
          },
        ],
        summary: { available: 1, notFound: 0, conflict: 0 },
      };

      service.previewRestore.mockResolvedValue(result);

      // @ts-expect-error - Controller method not implemented yet
      expect(await controller.previewRestore(request)).toBe(result);
      // @ts-expect-error - Service method not implemented yet
      expect(service.previewRestore).toHaveBeenCalledWith(request);
    });
  });

  describe('executeRestore', () => {
    it('should execute restore', async () => {
      const request: RestoreExecuteRequest = { items: [{ trashMetadataId: 'id1' }] };
      const result: RestoreExecuteResponse = {
        message: 'Started',
        queued: 1,
        excluded: 0,
        skipped: 0,
        syncEventIds: ['sync1'],
        skippedItems: [],
      };

      service.executeRestore.mockResolvedValue(result);

      // @ts-expect-error - Controller method not implemented yet
      expect(await controller.executeRestore(request)).toBe(result);
      // @ts-expect-error - Service method not implemented yet
      expect(service.executeRestore).toHaveBeenCalledWith(request, expect.any(String));
    });
  });

  describe('getRestoreStatus', () => {
    it('should return restore status', async () => {
      const syncEventIds = ['sync1'];
      const result: RestoreStatusResponse = {
        summary: { total: 1, pending: 1, processing: 0, done: 0, failed: 0 },
        isCompleted: false,
        items: [],
      };

      service.getRestoreStatus.mockResolvedValue(result);

      // @ts-expect-error - Controller method not implemented yet
      expect(await controller.getRestoreStatus(syncEventIds)).toBe(result);
      // @ts-expect-error - Service method not implemented yet
      expect(service.getRestoreStatus).toHaveBeenCalledWith(syncEventIds);
    });
  });

  describe('purgeFile', () => {
    it('should purge file', async () => {
      const trashMetadataId = 'id1';
      service.purgeFile.mockResolvedValue({ success: true });

      expect(await controller.purgeFile(trashMetadataId)).toEqual({ success: true });
      expect(service.purgeFile).toHaveBeenCalledWith(trashMetadataId, expect.any(String));
    });
  });

  describe('emptyTrash', () => {
    it('should empty trash', async () => {
      const result: EmptyTrashResponse = { message: 'Done', success: 10, failed: 0 };
      service.emptyTrash.mockResolvedValue(result);

      expect(await controller.emptyTrash()).toBe(result);
      expect(service.emptyTrash).toHaveBeenCalledWith(expect.any(String));
    });
  });
});
