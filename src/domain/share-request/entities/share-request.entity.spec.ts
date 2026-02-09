/**
 * ============================================================
 * 📦 ShareRequest 도메인 엔티티 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - ShareRequest 도메인 엔티티 클래스
 *
 * 📋 비즈니스 맥락:
 *   - 내부 사용자가 다른 사용자에게 파일 공유를 요청
 *   - 승인/거부/취소 상태 관리
 *   - 승인 시 PublicShare 생성
 *
 * ⚠️ 중요 고려사항:
 *   - PENDING 상태만 결정 가능 (승인/거부/취소)
 *   - 거부 시 코멘트 필수
 *   - 승인 시 approverId, decidedAt, decisionComment 설정
 * ============================================================
 */
import { ShareRequest } from './share-request.entity';
import { ShareRequestStatus } from '../type/share-request-status.enum';
import { ShareTargetType } from '../type/share-target.type';
import { SharePermissionType } from '../type/share-permission.type';

describe('ShareRequest Entity', () => {
  /**
   * 📌 테스트 시나리오: ShareRequest 엔티티 생성 (기본값)
   *
   * 🎯 검증 목적:
   *   ShareRequest 엔티티가 기본값으로 올바르게 생성되는지 확인
   *
   * ✅ 기대 결과:
   *   status=PENDING, isAutoApproved=false, publicShareIds=[], fileIds=[], targets=[]
   */
  it('should create with defaults (status=PENDING, isAutoApproved=false, publicShareIds=[], etc.)', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const props = {
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1', 'file-2'],
      targets: [
        { type: ShareTargetType.INTERNAL_USER, userId: 'user-target' },
      ],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업을 위한 공유 요청',
    };

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest(props);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(shareRequest.id).toBe('request-123');
    expect(shareRequest.status).toBe(ShareRequestStatus.PENDING);
    expect(shareRequest.isAutoApproved).toBe(false);
    expect(shareRequest.publicShareIds).toEqual([]);
    expect(shareRequest.fileIds).toEqual(['file-1', 'file-2']);
    expect(shareRequest.targets).toHaveLength(1);
    expect(shareRequest.requestedAt).toBeInstanceOf(Date);
  });

  /**
   * 📌 테스트 시나리오: approve() - PENDING → APPROVED 전환
   *
   * 🎯 검증 목적:
   *   approve()가 PENDING 상태를 APPROVED로 변경하고 승인 정보를 설정하는지 확인
   *
   * ✅ 기대 결과:
   *   status=APPROVED, approverId 설정, decidedAt 설정, decisionComment 설정
   */
  it('should approve() transition PENDING → APPROVED, sets approverId, decidedAt, decisionComment', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest({
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.PENDING,
    });

    const beforeApprove = new Date();
    const approverId = 'admin-123';
    const comment = '승인합니다';

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    shareRequest.approve(approverId, comment);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(shareRequest.status).toBe(ShareRequestStatus.APPROVED);
    expect(shareRequest.approverId).toBe(approverId);
    expect(shareRequest.decidedAt).toBeDefined();
    expect(shareRequest.decidedAt!.getTime()).toBeGreaterThanOrEqual(
      beforeApprove.getTime(),
    );
    expect(shareRequest.decisionComment).toBe(comment);
    expect(shareRequest.updatedAt).toBeDefined();
  });

  /**
   * 📌 테스트 시나리오: approve() - 비 PENDING 상태에서 에러
   *
   * 🎯 검증 목적:
   *   APPROVED 상태에서 approve() 호출 시 에러 발생 확인
   *
   * ✅ 기대 결과:
   *   Error: "Only PENDING requests can be approved"
   */
  it('should throw error when approve() on non-PENDING', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest({
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.APPROVED,
    });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN & THEN (실행 및 검증)
    // ═══════════════════════════════════════════════════════
    expect(() => shareRequest.approve('admin-123')).toThrow(
      'Only PENDING requests can be approved',
    );
  });

  /**
   * 📌 테스트 시나리오: reject() - PENDING → REJECTED 전환
   *
   * 🎯 검증 목적:
   *   reject()가 PENDING 상태를 REJECTED로 변경하고 거부 정보를 설정하는지 확인
   *
   * ✅ 기대 결과:
   *   status=REJECTED, approverId 설정, decidedAt 설정, decisionComment 설정
   */
  it('should reject() transition PENDING → REJECTED, requires comment', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest({
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.PENDING,
    });

    const beforeReject = new Date();
    const approverId = 'admin-123';
    const comment = '보안 정책 위반으로 거부';

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    shareRequest.reject(approverId, comment);

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(shareRequest.status).toBe(ShareRequestStatus.REJECTED);
    expect(shareRequest.approverId).toBe(approverId);
    expect(shareRequest.decidedAt).toBeDefined();
    expect(shareRequest.decidedAt!.getTime()).toBeGreaterThanOrEqual(
      beforeReject.getTime(),
    );
    expect(shareRequest.decisionComment).toBe(comment);
    expect(shareRequest.updatedAt).toBeDefined();
  });

  /**
   * 📌 테스트 시나리오: reject() - 빈 코멘트로 에러
   *
   * 🎯 검증 목적:
   *   reject() 호출 시 빈 코멘트로 에러 발생 확인
   *
   * ✅ 기대 결과:
   *   Error: "Rejection comment is required"
   */
  it('should throw error when reject() with empty comment', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest({
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.PENDING,
    });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN & THEN (실행 및 검증)
    // ═══════════════════════════════════════════════════════
    expect(() => shareRequest.reject('admin-123', '')).toThrow(
      'Rejection comment is required',
    );
    expect(() => shareRequest.reject('admin-123', '   ')).toThrow(
      'Rejection comment is required',
    );
  });

  /**
   * 📌 테스트 시나리오: reject() - 비 PENDING 상태에서 에러
   *
   * 🎯 검증 목적:
   *   APPROVED 상태에서 reject() 호출 시 에러 발생 확인
   *
   * ✅ 기대 결과:
   *   Error: "Only PENDING requests can be rejected"
   */
  it('should throw error when reject() on non-PENDING', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest({
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.APPROVED,
    });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN & THEN (실행 및 검증)
    // ═══════════════════════════════════════════════════════
    expect(() => shareRequest.reject('admin-123', '거부')).toThrow(
      'Only PENDING requests can be rejected',
    );
  });

  /**
   * 📌 테스트 시나리오: cancel() - PENDING → CANCELED 전환
   *
   * 🎯 검증 목적:
   *   cancel()가 PENDING 상태를 CANCELED로 변경하는지 확인
   *
   * ✅ 기대 결과:
   *   status=CANCELED, updatedAt 설정
   */
  it('should cancel() transition PENDING → CANCELED', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest({
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.PENDING,
    });

    const beforeCancel = new Date();

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    shareRequest.cancel();

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(shareRequest.status).toBe(ShareRequestStatus.CANCELED);
    expect(shareRequest.updatedAt).toBeDefined();
    expect(shareRequest.updatedAt!.getTime()).toBeGreaterThanOrEqual(
      beforeCancel.getTime(),
    );
  });

  /**
   * 📌 테스트 시나리오: cancel() - 비 PENDING 상태에서 에러
   *
   * 🎯 검증 목적:
   *   APPROVED 상태에서 cancel() 호출 시 에러 발생 확인
   *
   * ✅ 기대 결과:
   *   Error: "Only PENDING requests can be canceled"
   */
  it('should throw error when cancel() on non-PENDING', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const shareRequest = new ShareRequest({
      id: 'request-123',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.APPROVED,
    });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN & THEN (실행 및 검증)
    // ═══════════════════════════════════════════════════════
    expect(() => shareRequest.cancel()).toThrow(
      'Only PENDING requests can be canceled',
    );
  });

  /**
   * 📌 테스트 시나리오: isDecidable() - PENDING 상태만 true
   *
   * 🎯 검증 목적:
   *   isDecidable()가 PENDING 상태일 때만 true를 반환하는지 확인
   *
   * ✅ 기대 결과:
   *   PENDING: true, APPROVED/REJECTED/CANCELED: false
   */
  it('should isDecidable() return true only when PENDING', () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const pendingRequest = new ShareRequest({
      id: 'request-1',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.PENDING,
    });

    const approvedRequest = new ShareRequest({
      id: 'request-2',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.APPROVED,
    });

    const rejectedRequest = new ShareRequest({
      id: 'request-3',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.REJECTED,
    });

    const canceledRequest = new ShareRequest({
      id: 'request-4',
      requesterId: 'user-requester',
      fileIds: ['file-1'],
      targets: [{ type: ShareTargetType.INTERNAL_USER, userId: 'user-target' }],
      permission: { type: SharePermissionType.VIEW },
      startAt: new Date('2026-02-01'),
      endAt: new Date('2026-02-28'),
      reason: '프로젝트 협업',
      status: ShareRequestStatus.CANCELED,
    });

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN & THEN (실행 및 검증)
    // ═══════════════════════════════════════════════════════
    expect(pendingRequest.isDecidable()).toBe(true);
    expect(approvedRequest.isDecidable()).toBe(false);
    expect(rejectedRequest.isDecidable()).toBe(false);
    expect(canceledRequest.isDecidable()).toBe(false);
  });
});
