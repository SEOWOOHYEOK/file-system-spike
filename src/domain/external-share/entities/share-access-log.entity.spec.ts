/**
 * ============================================================
 * 📦 ShareAccessLog 도메인 엔티티 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ShareAccessLog 도메인 엔티티 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 외부 사용자의 공유 파일 접근 로그 기록
 *   - VIEW/DOWNLOAD 액션별 로그 분리
 *   - 성공/실패 및 실패 사유 기록
 *   - IP, User-Agent, Device Type 등 상세 정보 추적
 *
 * ⚠️ 중요 고려사항:
 *   - 감사(Audit) 목적으로 모든 접근 시도 기록
 *   - 실패 시 failReason으로 원인 추적 가능
 *   - 관리자가 의심스러운 활동 모니터링 가능
 * ============================================================
 */
import { ShareAccessLog, AccessAction } from './share-access-log.entity';

describe('ShareAccessLog Entity', () => {
  /**
   * 📌 테스트 시나리오: ShareAccessLog 엔티티 생성
   *
   * 🎯 검증 목적:
   *   ShareAccessLog 엔티티가 올바른 속성으로 생성되는지 확인
   *
   * ✅ 기대 결과:
   *   모든 속성이 전달된 값으로 초기화됨
   */
  it('should create a ShareAccessLog with all properties', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const props = {
      id: 'log-123',
      publicShareId: 'share-456',
      externalUserId: 'ext-user-789',
      action: AccessAction.VIEW,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      deviceType: 'desktop',
      accessedAt: new Date('2026-01-28T10:00:00Z'),
      success: true,
    };

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const log = new ShareAccessLog(props);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(log.id).toBe('log-123');
    expect(log.publicShareId).toBe('share-456');
    expect(log.externalUserId).toBe('ext-user-789');
    expect(log.action).toBe(AccessAction.VIEW);
    expect(log.ipAddress).toBe('192.168.1.100');
    expect(log.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(log.deviceType).toBe('desktop');
    expect(log.success).toBe(true);
    expect(log.failReason).toBeUndefined();
  });

  /**
   * 📌 테스트 시나리오: 실패 로그 생성
   *
   * 🎯 검증 목적:
   *   실패한 접근 로그가 failReason과 함께 생성되는지 확인
   */
  it('should create a failed ShareAccessLog with failReason', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const props = {
      id: 'log-123',
      publicShareId: 'share-456',
      externalUserId: 'ext-user-789',
      action: AccessAction.DOWNLOAD,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      deviceType: 'mobile',
      accessedAt: new Date('2026-01-28T10:00:00Z'),
      success: false,
      failReason: 'LIMIT_EXCEEDED',
    };

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const log = new ShareAccessLog(props);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(log.success).toBe(false);
    expect(log.failReason).toBe('LIMIT_EXCEEDED');
  });

  /**
   * 📌 테스트 시나리오: 성공 로그 팩토리 메서드 (createSuccess)
   */
  describe('createSuccess', () => {
    /**
     * 🎯 검증 목적: 성공 로그 간편 생성
     */
    it('should create a success log with current timestamp', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const beforeCreate = new Date();

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const log = ShareAccessLog.createSuccess({
        publicShareId: 'share-456',
        externalUserId: 'ext-user-789',
        action: AccessAction.VIEW,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        deviceType: 'desktop',
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(log.success).toBe(true);
      expect(log.failReason).toBeUndefined();
      expect(log.publicShareId).toBe('share-456');
      expect(log.externalUserId).toBe('ext-user-789');
      expect(log.action).toBe(AccessAction.VIEW);
      expect(log.accessedAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime(),
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 실패 로그 팩토리 메서드 (createFailure)
   */
  describe('createFailure', () => {
    /**
     * 🎯 검증 목적: 실패 로그 간편 생성 (failReason 필수)
     */
    it('should create a failure log with failReason', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const beforeCreate = new Date();

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const log = ShareAccessLog.createFailure({
        publicShareId: 'share-456',
        externalUserId: 'ext-user-789',
        action: AccessAction.DOWNLOAD,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        deviceType: 'mobile',
        failReason: 'SHARE_EXPIRED',
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(log.success).toBe(false);
      expect(log.failReason).toBe('SHARE_EXPIRED');
      expect(log.publicShareId).toBe('share-456');
      expect(log.action).toBe(AccessAction.DOWNLOAD);
      expect(log.accessedAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime(),
      );
    });

    /**
     * 🎯 검증 목적: 다양한 실패 사유 테스트
     */
    it.each([
      'INVALID_TOKEN',
      'SHARE_BLOCKED',
      'SHARE_REVOKED',
      'USER_BLOCKED',
      'SHARE_EXPIRED',
      'LIMIT_EXCEEDED',
      'PERMISSION_DENIED',
    ])('should create failure log with reason: %s', (failReason) => {
      const log = ShareAccessLog.createFailure({
        publicShareId: 'share-456',
        externalUserId: 'ext-user-789',
        action: AccessAction.VIEW,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        deviceType: 'desktop',
        failReason,
      });

      expect(log.success).toBe(false);
      expect(log.failReason).toBe(failReason);
    });
  });

  /**
   * 📌 테스트 시나리오: VIEW 액션 로그
   */
  describe('VIEW action', () => {
    /**
     * 🎯 검증 목적: VIEW 액션 로그 생성
     */
    it('should create log for VIEW action', () => {
      const log = ShareAccessLog.createSuccess({
        publicShareId: 'share-456',
        externalUserId: 'ext-user-789',
        action: AccessAction.VIEW,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        deviceType: 'desktop',
      });

      expect(log.action).toBe(AccessAction.VIEW);
    });
  });

  /**
   * 📌 테스트 시나리오: DOWNLOAD 액션 로그
   */
  describe('DOWNLOAD action', () => {
    /**
     * 🎯 검증 목적: DOWNLOAD 액션 로그 생성
     */
    it('should create log for DOWNLOAD action', () => {
      const log = ShareAccessLog.createSuccess({
        publicShareId: 'share-456',
        externalUserId: 'ext-user-789',
        action: AccessAction.DOWNLOAD,
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        deviceType: 'tablet',
      });

      expect(log.action).toBe(AccessAction.DOWNLOAD);
    });
  });
});
