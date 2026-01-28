/**
 * ============================================================
 * 📦 PublicShare 도메인 엔티티 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - PublicShare 도메인 엔티티 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 내부 사용자가 외부 사용자에게 파일을 공유할 때 생성
 *   - 뷰 횟수, 다운로드 횟수, 만료일 제한 가능
 *   - 관리자가 차단하거나 소유자가 취소 가능
 *
 * ⚠️ 중요 고려사항:
 *   - isBlocked: 관리자가 차단한 공유
 *   - isRevoked: 소유자가 취소한 공유
 *   - 뷰/다운로드 횟수는 별도로 관리
 *   - VIEW/DOWNLOAD 권한 분리
 * ============================================================
 */
import { PublicShare } from './public-share.entity';
import { SharePermission } from '../../share/share-permission.enum';

describe('PublicShare Entity', () => {
  /**
   * 📌 테스트 시나리오: PublicShare 엔티티 생성
   *
   * 🎯 검증 목적:
   *   PublicShare 엔티티가 올바른 속성으로 생성되는지 확인
   *
   * ✅ 기대 결과:
   *   모든 속성이 전달된 값으로 초기화됨
   */
  it('should create a PublicShare with all properties', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const props = {
      id: 'share-123',
      fileId: 'file-456',
      ownerId: 'user-owner',
      externalUserId: 'ext-user-789',
      permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
      maxViewCount: 10,
      currentViewCount: 2,
      maxDownloadCount: 5,
      currentDownloadCount: 1,
      expiresAt: new Date('2026-02-01'),
      isBlocked: false,
      isRevoked: false,
      createdAt: new Date('2026-01-01'),
    };

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const share = new PublicShare(props);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(share.id).toBe('share-123');
    expect(share.fileId).toBe('file-456');
    expect(share.ownerId).toBe('user-owner');
    expect(share.externalUserId).toBe('ext-user-789');
    expect(share.permissions).toContain(SharePermission.VIEW);
    expect(share.permissions).toContain(SharePermission.DOWNLOAD);
    expect(share.maxViewCount).toBe(10);
    expect(share.currentViewCount).toBe(2);
    expect(share.maxDownloadCount).toBe(5);
    expect(share.currentDownloadCount).toBe(1);
    expect(share.isBlocked).toBe(false);
    expect(share.isRevoked).toBe(false);
  });

  /**
   * 📌 테스트 시나리오: 기본값으로 PublicShare 생성
   *
   * 🎯 검증 목적:
   *   카운트와 상태 필드가 기본값으로 초기화되는지 확인
   *
   * ✅ 기대 결과:
   *   currentViewCount: 0, currentDownloadCount: 0,
   *   isBlocked: false, isRevoked: false, permissions: []
   */
  it('should initialize with default values', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const props = {
      id: 'share-123',
      fileId: 'file-456',
      ownerId: 'user-owner',
      externalUserId: 'ext-user-789',
    };

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const share = new PublicShare(props);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(share.currentViewCount).toBe(0);
    expect(share.currentDownloadCount).toBe(0);
    expect(share.isBlocked).toBe(false);
    expect(share.isRevoked).toBe(false);
    expect(share.permissions).toEqual([]);
  });

  /**
   * 📌 테스트 시나리오: 공유 유효성 검증 (isValid)
   *
   * 종합적인 유효성 검증:
   * - 만료일, 뷰 횟수, 다운로드 횟수, 차단/취소 상태
   */
  describe('isValid', () => {
    /**
     * 🎯 검증 목적: 모든 조건이 충족되면 유효
     */
    it('should return true when all conditions are met', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxViewCount: 10,
        currentViewCount: 2,
        maxDownloadCount: 5,
        currentDownloadCount: 1,
        expiresAt: new Date(Date.now() + 86400000), // 내일
        isBlocked: false,
        isRevoked: false,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      expect(share.isValid()).toBe(true);
    });

    /**
     * 🎯 검증 목적: 차단된 공유는 무효
     */
    it('should return false when isBlocked is true', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        isBlocked: true, // 차단됨
        isRevoked: false,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      expect(share.isValid()).toBe(false);
    });

    /**
     * 🎯 검증 목적: 취소된 공유는 무효
     */
    it('should return false when isRevoked is true', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        isBlocked: false,
        isRevoked: true, // 취소됨
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      expect(share.isValid()).toBe(false);
    });

    /**
     * 🎯 검증 목적: 만료된 공유는 무효
     */
    it('should return false when expired', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        expiresAt: new Date('2020-01-01'), // 과거
        isBlocked: false,
        isRevoked: false,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      expect(share.isValid()).toBe(false);
    });

    /**
     * 🎯 검증 목적: 제한 없으면 항상 유효 (차단/취소 제외)
     */
    it('should return true when no limits are set', () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        // 만료일, 뷰/다운로드 제한 없음
        isBlocked: false,
        isRevoked: false,
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN & THEN (실행 및 검증)
      // ═══════════════════════════════════════════════════════
      expect(share.isValid()).toBe(true);
    });
  });

  /**
   * 📌 테스트 시나리오: 만료 여부 확인 (isExpired)
   */
  describe('isExpired', () => {
    /**
     * 🎯 검증 목적: 만료일이 지났으면 true
     */
    it('should return true when expiresAt is in the past', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        expiresAt: new Date('2020-01-01'),
      });

      expect(share.isExpired()).toBe(true);
    });

    /**
     * 🎯 검증 목적: 만료일 전이면 false
     */
    it('should return false when expiresAt is in the future', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        expiresAt: new Date(Date.now() + 86400000),
      });

      expect(share.isExpired()).toBe(false);
    });

    /**
     * 🎯 검증 목적: 만료일 없으면 false (무기한)
     */
    it('should return false when expiresAt is not set', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
      });

      expect(share.isExpired()).toBe(false);
    });
  });

  /**
   * 📌 테스트 시나리오: 뷰 횟수 제한 초과 확인 (isViewLimitExceeded)
   */
  describe('isViewLimitExceeded', () => {
    /**
     * 🎯 검증 목적: 뷰 횟수가 제한에 도달하면 true
     */
    it('should return true when view count reaches limit', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxViewCount: 10,
        currentViewCount: 10,
      });

      expect(share.isViewLimitExceeded()).toBe(true);
    });

    /**
     * 🎯 검증 목적: 뷰 횟수가 제한 미만이면 false
     */
    it('should return false when view count is below limit', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxViewCount: 10,
        currentViewCount: 5,
      });

      expect(share.isViewLimitExceeded()).toBe(false);
    });

    /**
     * 🎯 검증 목적: 뷰 제한 없으면 항상 false
     */
    it('should return false when no view limit is set', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        currentViewCount: 1000,
      });

      expect(share.isViewLimitExceeded()).toBe(false);
    });
  });

  /**
   * 📌 테스트 시나리오: 다운로드 횟수 제한 초과 확인 (isDownloadLimitExceeded)
   */
  describe('isDownloadLimitExceeded', () => {
    /**
     * 🎯 검증 목적: 다운로드 횟수가 제한에 도달하면 true
     */
    it('should return true when download count reaches limit', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxDownloadCount: 5,
        currentDownloadCount: 5,
      });

      expect(share.isDownloadLimitExceeded()).toBe(true);
    });

    /**
     * 🎯 검증 목적: 다운로드 횟수가 제한 미만이면 false
     */
    it('should return false when download count is below limit', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxDownloadCount: 5,
        currentDownloadCount: 2,
      });

      expect(share.isDownloadLimitExceeded()).toBe(false);
    });

    /**
     * 🎯 검증 목적: 다운로드 제한 없으면 항상 false
     */
    it('should return false when no download limit is set', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        currentDownloadCount: 1000,
      });

      expect(share.isDownloadLimitExceeded()).toBe(false);
    });
  });

  /**
   * 📌 테스트 시나리오: 뷰 카운트 증가 (incrementViewCount)
   */
  describe('incrementViewCount', () => {
    /**
     * 🎯 검증 목적: 뷰 카운트 정상 증가
     */
    it('should increment view count', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxViewCount: 10,
        currentViewCount: 5,
      });

      share.incrementViewCount();

      expect(share.currentViewCount).toBe(6);
    });

    /**
     * 🎯 검증 목적: 뷰 제한 도달 시 에러
     */
    it('should throw error when view limit exceeded', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxViewCount: 10,
        currentViewCount: 10,
      });

      expect(() => share.incrementViewCount()).toThrow('View limit exceeded');
    });

    /**
     * 🎯 검증 목적: 뷰 제한 없으면 항상 증가 가능
     */
    it('should increment without limit when maxViewCount is undefined', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        currentViewCount: 100,
      });

      share.incrementViewCount();

      expect(share.currentViewCount).toBe(101);
    });
  });

  /**
   * 📌 테스트 시나리오: 다운로드 카운트 증가 (incrementDownloadCount)
   */
  describe('incrementDownloadCount', () => {
    /**
     * 🎯 검증 목적: 다운로드 카운트 정상 증가
     */
    it('should increment download count', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxDownloadCount: 5,
        currentDownloadCount: 2,
      });

      share.incrementDownloadCount();

      expect(share.currentDownloadCount).toBe(3);
    });

    /**
     * 🎯 검증 목적: 다운로드 제한 도달 시 에러
     */
    it('should throw error when download limit exceeded', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        maxDownloadCount: 5,
        currentDownloadCount: 5,
      });

      expect(() => share.incrementDownloadCount()).toThrow(
        'Download limit exceeded',
      );
    });

    /**
     * 🎯 검증 목적: 다운로드 제한 없으면 항상 증가 가능
     */
    it('should increment without limit when maxDownloadCount is undefined', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        currentDownloadCount: 100,
      });

      share.incrementDownloadCount();

      expect(share.currentDownloadCount).toBe(101);
    });
  });

  /**
   * 📌 테스트 시나리오: 권한 확인 (hasPermission)
   */
  describe('hasPermission', () => {
    /**
     * 🎯 검증 목적: 보유한 권한이면 true
     */
    it('should return true when permission exists', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        permissions: [SharePermission.VIEW, SharePermission.DOWNLOAD],
      });

      expect(share.hasPermission(SharePermission.VIEW)).toBe(true);
      expect(share.hasPermission(SharePermission.DOWNLOAD)).toBe(true);
    });

    /**
     * 🎯 검증 목적: 없는 권한이면 false
     */
    it('should return false when permission does not exist', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        permissions: [SharePermission.VIEW],
      });

      expect(share.hasPermission(SharePermission.DOWNLOAD)).toBe(false);
    });
  });

  /**
   * 📌 테스트 시나리오: 관리자 차단 (block)
   */
  describe('block', () => {
    /**
     * 🎯 검증 목적: 차단 상태로 변경 및 차단 정보 기록
     */
    it('should set isBlocked to true and record block info', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        isBlocked: false,
      });

      const beforeBlock = new Date();
      share.block('admin-123');

      expect(share.isBlocked).toBe(true);
      expect(share.blockedBy).toBe('admin-123');
      expect(share.blockedAt).toBeDefined();
      expect(share.blockedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeBlock.getTime(),
      );
    });
  });

  /**
   * 📌 테스트 시나리오: 차단 해제 (unblock)
   */
  describe('unblock', () => {
    /**
     * 🎯 검증 목적: 차단 해제
     */
    it('should set isBlocked to false and clear block info', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        isBlocked: true,
        blockedBy: 'admin-123',
        blockedAt: new Date(),
      });

      share.unblock();

      expect(share.isBlocked).toBe(false);
      expect(share.blockedBy).toBeUndefined();
      expect(share.blockedAt).toBeUndefined();
    });
  });

  /**
   * 📌 테스트 시나리오: 소유자 취소 (revoke)
   */
  describe('revoke', () => {
    /**
     * 🎯 검증 목적: 취소 상태로 변경
     */
    it('should set isRevoked to true', () => {
      const share = new PublicShare({
        id: 'share-123',
        fileId: 'file-456',
        ownerId: 'user-owner',
        externalUserId: 'ext-user-789',
        isRevoked: false,
      });

      share.revoke();

      expect(share.isRevoked).toBe(true);
    });
  });
});
