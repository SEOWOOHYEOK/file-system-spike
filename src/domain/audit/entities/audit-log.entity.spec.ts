import { AuditLog } from './audit-log.entity';
import { AuditAction, ActionCategory } from '../enums/audit-action.enum';
import {
  UserType,
  TargetType,
  LogResult,
  ClientType,
} from '../enums/common.enum';

/**
 * AuditLog 엔티티 단위 테스트
 *
 * 감사 로그 도메인 엔티티의 생성 및 팩토리 메서드 테스트
 */
describe('AuditLog', () => {
  const baseParams = {
    requestId: 'req-123',
    sessionId: 'sess-456',
    traceId: 'trace-789',
    userId: 'user-abc',
    userType: UserType.INTERNAL,
    userName: 'Test User',
    userEmail: 'test@example.com',
    action: AuditAction.FILE_DOWNLOAD,
    targetType: TargetType.FILE,
    targetId: 'file-xyz',
    targetName: 'document.pdf',
    targetPath: '/documents/document.pdf',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    deviceFingerprint: 'fp-hash-123',
    clientType: ClientType.WEB,
    result: LogResult.SUCCESS,
  };

  describe('create', () => {
    it('기본 파라미터로 감사 로그를 생성해야 함', () => {
      // When
      const log = AuditLog.create(baseParams);

      // Then
      expect(log).toBeInstanceOf(AuditLog);
      expect(log.requestId).toBe('req-123');
      expect(log.userId).toBe('user-abc');
      expect(log.userType).toBe(UserType.INTERNAL);
      expect(log.action).toBe(AuditAction.FILE_DOWNLOAD);
      expect(log.actionCategory).toBe(ActionCategory.FILE);
      expect(log.targetType).toBe(TargetType.FILE);
      expect(log.targetId).toBe('file-xyz');
      expect(log.result).toBe(LogResult.SUCCESS);
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it('메타데이터와 태그를 포함할 수 있어야 함', () => {
      // Given
      const params = {
        ...baseParams,
        metadata: { fileSize: 1024, mimeType: 'application/pdf' },
        tags: ['download', 'document'],
      };

      // When
      const log = AuditLog.create(params);

      // Then
      expect(log.metadata).toEqual({ fileSize: 1024, mimeType: 'application/pdf' });
      expect(log.tags).toEqual(['download', 'document']);
    });

    it('선택적 필드가 없어도 생성되어야 함', () => {
      // Given
      const minimalParams = {
        requestId: 'req-123',
        userId: 'user-abc',
        userType: UserType.INTERNAL,
        action: AuditAction.FILE_VIEW,
        targetType: TargetType.FILE,
        targetId: 'file-xyz',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        result: LogResult.SUCCESS,
      };

      // When
      const log = AuditLog.create(minimalParams);

      // Then
      expect(log.sessionId).toBeUndefined();
      expect(log.traceId).toBeUndefined();
      expect(log.userName).toBeUndefined();
      expect(log.clientType).toBe(ClientType.UNKNOWN);
    });
  });

  describe('createSuccess', () => {
    it('성공 로그를 생성해야 함', () => {
      // Given
      const params = {
        requestId: 'req-123',
        userId: 'user-abc',
        userType: UserType.INTERNAL,
        action: AuditAction.FILE_UPLOAD,
        targetType: TargetType.FILE,
        targetId: 'file-new',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // When
      const log = AuditLog.createSuccess(params);

      // Then
      expect(log.result).toBe(LogResult.SUCCESS);
      expect(log.failReason).toBeUndefined();
    });
  });

  describe('createFailure', () => {
    it('실패 로그를 생성해야 함', () => {
      // Given
      const params = {
        requestId: 'req-123',
        userId: 'user-abc',
        userType: UserType.INTERNAL,
        action: AuditAction.FILE_DOWNLOAD,
        targetType: TargetType.FILE,
        targetId: 'file-xyz',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        failReason: 'File not found',
        resultCode: '404',
      };

      // When
      const log = AuditLog.createFailure(params);

      // Then
      expect(log.result).toBe(LogResult.FAIL);
      expect(log.failReason).toBe('File not found');
      expect(log.resultCode).toBe('404');
    });
  });

  describe('reconstitute', () => {
    it('DB에서 로드한 데이터로 엔티티를 재구성해야 함', () => {
      // Given
      const dbData = {
        id: 'log-123',
        requestId: 'req-123',
        userId: 'user-abc',
        userType: UserType.INTERNAL,
        action: AuditAction.FILE_VIEW,
        actionCategory: ActionCategory.FILE,
        targetType: TargetType.FILE,
        targetId: 'file-xyz',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        result: LogResult.SUCCESS,
        clientType: ClientType.WEB,
        createdAt: new Date('2025-01-01'),
      };

      // When
      const log = AuditLog.reconstitute(dbData);

      // Then
      expect(log.id).toBe('log-123');
      expect(log.createdAt).toEqual(new Date('2025-01-01'));
    });
  });

  describe('actionCategory', () => {
    it.each([
      [AuditAction.FILE_DOWNLOAD, ActionCategory.FILE],
      [AuditAction.FILE_UPLOAD, ActionCategory.FILE],
      [AuditAction.FOLDER_CREATE, ActionCategory.FOLDER],
      [AuditAction.SHARE_CREATE, ActionCategory.SHARE],
      [AuditAction.PERMISSION_GRANT, ActionCategory.ADMIN],
    ])(
      '%s 액션은 %s 카테고리여야 함',
      (action, expectedCategory) => {
        // Given
        const params = { ...baseParams, action };

        // When
        const log = AuditLog.create(params);

        // Then
        expect(log.actionCategory).toBe(expectedCategory);
      },
    );
  });
});
