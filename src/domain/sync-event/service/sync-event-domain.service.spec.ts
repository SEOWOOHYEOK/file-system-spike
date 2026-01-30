/**
 * ============================================================
 * 📦 동기화 이벤트 도메인 서비스 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - SyncEventDomainService.조회 (ID 조회)
 *   - SyncEventDomainService.파일별조회 (파일 ID 기준 조회)
 *
 * 📋 비즈니스 맥락:
 *   - 동기화 이벤트 도메인 조회는 비즈니스 레이어의 기본 빌딩 블록이다
 *
 * ⚠️ 중요 고려사항:
 *   - 레포지토리 조회 결과를 그대로 반환해야 한다
 * ============================================================
 */

import { SyncEventDomainService } from './sync-event-domain.service';
import { SyncEventEntity, SyncEventStatus, SyncEventTargetType, SyncEventType } from '../entities/sync-event.entity';

describe('SyncEventDomainService', () => {
  /**
   * 🎭 Mock 설정
   * 📍 mockSyncEventRepository.findById:
   *   - 실제 동작: 이벤트 ID로 조회
   *   - Mock 이유: 도메인 서비스의 조회 위임을 검증
   */
  const mockSyncEventRepository = {
    findById: jest.fn(),
    findByFileId: jest.fn(),
  };

  let service: SyncEventDomainService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SyncEventDomainService(mockSyncEventRepository as any);
  });

  /**
   * 📌 테스트 시나리오: ID로 이벤트 조회
   *
   * 🎯 검증 목적:
   *   - 저장소 조회 결과가 그대로 반환되어야 한다
   *
   * ✅ 기대 결과:
   *   - 반환 객체가 동일한 이벤트 엔티티
   */
  it('ID로 조회한 동기화 이벤트를 그대로 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const syncEvent = new SyncEventEntity({
      id: 'sync-event-1',
      eventType: SyncEventType.CREATE,
      targetType: SyncEventTargetType.FILE,
      status: SyncEventStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSyncEventRepository.findById.mockResolvedValue(syncEvent);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.조회('sync-event-1');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toBe(syncEvent);
  });

  /**
   * 📌 테스트 시나리오: 파일 ID로 이벤트 목록 조회
   *
   * 🎯 검증 목적:
   *   - 파일 기준 조회 결과 목록이 그대로 반환되어야 한다
   *
   * ✅ 기대 결과:
   *   - 배열 길이와 내용이 일치
   */
  it('파일 ID 기준 조회 결과 목록을 반환해야 한다', async () => {
    // ═══════════════════════════════════════════════════════
    // 📥 GIVEN (사전 조건 설정)
    // ═══════════════════════════════════════════════════════
    const events = [
      new SyncEventEntity({
        id: 'sync-event-1',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        status: SyncEventStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      new SyncEventEntity({
        id: 'sync-event-2',
        eventType: SyncEventType.RENAME,
        targetType: SyncEventTargetType.FILE,
        status: SyncEventStatus.PROCESSING,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ];
    mockSyncEventRepository.findByFileId.mockResolvedValue(events);

    // ═══════════════════════════════════════════════════════
    // 🎬 WHEN (테스트 실행)
    // ═══════════════════════════════════════════════════════
    const result = await service.파일별조회('file-1');

    // ═══════════════════════════════════════════════════════
    // ✅ THEN (결과 검증)
    // ═══════════════════════════════════════════════════════
    expect(result).toEqual(events);
  });
});
