import { FileActionRequest } from './file-action-request.entity';
import { FileActionType } from '../enums/file-action-type.enum';
import { FileActionRequestStatus } from '../enums/file-action-request-status.enum';

describe('FileActionRequest', () => {
  const createPendingRequest = (overrides = {}) =>
    new FileActionRequest({
      id: 'req-1',
      type: FileActionType.MOVE,
      fileId: 'file-1',
      fileName: 'test.pdf',
      sourceFolderId: 'folder-a',
      targetFolderId: 'folder-b',
      requesterId: 'user-1',
      designatedApproverId: 'manager-1',
      reason: '정리 필요',
      snapshotFolderId: 'folder-a',
      snapshotFileState: 'ACTIVE',
      ...overrides,
    });

  describe('constructor defaults', () => {
    it('status defaults to PENDING', () => {
      const req = createPendingRequest();
      expect(req.status).toBe(FileActionRequestStatus.PENDING);
    });

    it('requestedAt defaults to now', () => {
      const req = createPendingRequest();
      expect(req.requestedAt).toBeInstanceOf(Date);
    });
  });

  describe('approve', () => {
    it('changes status to APPROVED', () => {
      const req = createPendingRequest();
      req.approve('manager-1', '승인합니다');
      expect(req.status).toBe(FileActionRequestStatus.APPROVED);
      expect(req.approverId).toBe('manager-1');
      expect(req.decisionComment).toBe('승인합니다');
      expect(req.decidedAt).toBeInstanceOf(Date);
    });

    it('throws if not PENDING', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(() => req.approve('manager-1')).toThrow();
    });
  });

  describe('reject', () => {
    it('changes status to REJECTED with required comment', () => {
      const req = createPendingRequest();
      req.reject('manager-1', '사유 불충분');
      expect(req.status).toBe(FileActionRequestStatus.REJECTED);
      expect(req.decisionComment).toBe('사유 불충분');
    });

    it('throws without comment', () => {
      const req = createPendingRequest();
      expect(() => req.reject('manager-1', '')).toThrow();
    });
  });

  describe('cancel', () => {
    it('changes status to CANCELED', () => {
      const req = createPendingRequest();
      req.cancel();
      expect(req.status).toBe(FileActionRequestStatus.CANCELED);
    });
  });

  describe('validateStateForExecution', () => {
    it('returns true when state matches snapshot', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(req.validateStateForExecution('folder-a', 'ACTIVE')).toBe(true);
    });

    it('returns false and marks INVALIDATED when folder changed', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(req.validateStateForExecution('folder-c', 'ACTIVE')).toBe(false);
      expect(req.status).toBe(FileActionRequestStatus.INVALIDATED);
      expect(req.executionNote).toContain('folder-c');
    });

    it('returns false when file not ACTIVE', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      expect(req.validateStateForExecution('folder-a', 'TRASHED')).toBe(false);
      expect(req.status).toBe(FileActionRequestStatus.INVALIDATED);
    });
  });

  describe('markExecuted / markFailed', () => {
    it('markExecuted sets EXECUTED', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      req.markExecuted();
      expect(req.status).toBe(FileActionRequestStatus.EXECUTED);
      expect(req.executedAt).toBeInstanceOf(Date);
    });

    it('markFailed sets FAILED with reason', () => {
      const req = createPendingRequest();
      req.approve('manager-1');
      req.markFailed('NAS 연결 실패');
      expect(req.status).toBe(FileActionRequestStatus.FAILED);
      expect(req.executionNote).toBe('NAS 연결 실패');
    });
  });
});
