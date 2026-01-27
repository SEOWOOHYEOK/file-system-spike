/**
 * ============================================================
 * 📦 AdminSyncEventDomainService 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - AdminSyncEventDomainService
 *
 * 📋 비즈니스 맥락:
 *   - 동기화 이벤트 문제를 확인하고 진단하는 Admin 기능
 *   - 장시간 대기(stuck) 상태의 이벤트 탐지
 *   - 실패한 동기화 이벤트 조회 및 분석
 *
 * ⚠️ 중요 고려사항:
 *   - stuck 판단 기준: PENDING 1시간 이상, PROCESSING 30분 이상
 *   - 페이징 및 필터링 지원
 *   - 상태별/이벤트타입별 요약 정보 제공
 * ============================================================
 */
import { Test, TestingModule } from '@nestjs/testing';
import { SyncEventStatsService } from './sync-event-stats.service';
import {
  SYNC_EVENT_REPOSITORY,
  ISyncEventRepository,
} from '../../domain/sync-event/repositories/sync-event.repository.interface';
import {
  SyncEventEntity,
  SyncEventStatus,
  SyncEventType,
  SyncEventTargetType,
} from '../../domain/sync-event/entities/sync-event.entity';

describe('SyncEventStatsService', () => {
  let service: SyncEventStatsService;
  let syncEventRepo: jest.Mocked<ISyncEventRepository>;

  /**
   * 🎭 Mock 설정
   * 📍 syncEventRepo:
   *   - 실제 동작: DB에서 동기화 이벤트 조회
   *   - Mock 이유: 실제 DB 연결 없이 테스트하기 위함
   */
  beforeEach(async () => {
    syncEventRepo = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findByFileId: jest.fn(),
      findByStatus: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      updateStatus: jest.fn(),
    } as jest.Mocked<ISyncEventRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncEventStatsService,
        {
          provide: SYNC_EVENT_REPOSITORY,
          useValue: syncEventRepo,
        },
      ],
    }).compile();

    service = module.get<SyncEventStatsService>(SyncEventStatsService);
  });

  describe('findSyncEvents', () => {
    /**
     * 📌 테스트 시나리오: 1시간 이상 대기 중인 PENDING 이벤트를 stuck으로 판단
     *
     * 🎯 검증 목적:
     *   PENDING 상태로 오래 대기 중인 이벤트는 문제가 있을 가능성이 높으므로
     *   이를 탐지하여 운영자에게 알려야 함
     *
     * ✅ 기대 결과:
     *   - 1시간 이상 대기 중인 PENDING 이벤트가 isStuck=true로 반환됨
     */
    it('should detect stuck pending events (waiting over 1 hour)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const twoHoursAgo = new Date();
      twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

      const stuckPendingEvent = new SyncEventEntity({
        id: 'event-1',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-1',
        sourcePath: '/cache/file1.pdf',
        targetPath: '/nas/file1.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: twoHoursAgo,
        updatedAt: twoHoursAgo,
      });

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.PENDING) return [stuckPendingEvent];
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        status: SyncEventStatus.PENDING,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(1);
      expect(result.events[0].isStuck).toBe(true);
      expect(result.events[0].ageHours).toBeGreaterThanOrEqual(2);
      expect(result.summary.stuckPending).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 30분 이상 처리 중인 PROCESSING 이벤트를 stuck으로 판단
     *
     * 🎯 검증 목적:
     *   PROCESSING 상태가 30분 이상 지속되면 Worker가 멈췄거나
     *   무한 루프에 빠진 것일 수 있으므로 이를 탐지해야 함
     *
     * ✅ 기대 결과:
     *   - 30분 이상 처리 중인 이벤트가 isStuck=true로 반환됨
     */
    it('should detect stuck processing events (processing over 30 minutes)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const stuckProcessingEvent = new SyncEventEntity({
        id: 'event-2',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-2',
        sourcePath: '/cache/file2.pdf',
        targetPath: '/nas/file2.pdf',
        status: SyncEventStatus.PROCESSING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.PROCESSING) return [stuckProcessingEvent];
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        status: SyncEventStatus.PROCESSING,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(1);
      expect(result.events[0].isStuck).toBe(true);
      expect(result.summary.stuckProcessing).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 최근 생성된 이벤트는 stuck으로 판단하지 않음
     *
     * 🎯 검증 목적:
     *   방금 생성된 PENDING 이벤트는 아직 처리 대기 중인 정상 상태이므로
     *   stuck으로 판단하면 안 됨
     *
     * ✅ 기대 결과:
     *   - 최근 생성된 이벤트는 isStuck=false로 반환됨
     */
    it('should not mark recent pending events as stuck', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      const recentPendingEvent = new SyncEventEntity({
        id: 'event-3',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-3',
        sourcePath: '/cache/file3.pdf',
        targetPath: '/nas/file3.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: fiveMinutesAgo,
        updatedAt: fiveMinutesAgo,
      });

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.PENDING) return [recentPendingEvent];
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        status: SyncEventStatus.PENDING,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(1);
      expect(result.events[0].isStuck).toBe(false);
      expect(result.summary.stuckPending).toBe(0);
    });

    /**
     * 📌 테스트 시나리오: FAILED 상태 이벤트 조회
     *
     * 🎯 검증 목적:
     *   최대 재시도 횟수 초과로 실패한 이벤트들을 조회하여
     *   수동 처리가 필요한 항목을 파악해야 함
     *
     * ✅ 기대 결과:
     *   - FAILED 상태 이벤트가 조회되고 summary.failed 카운트에 반영됨
     */
    it('should return failed events with summary', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const failedEvent = new SyncEventEntity({
        id: 'event-4',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-4',
        sourcePath: '/cache/file4.pdf',
        targetPath: '/nas/file4.pdf',
        status: SyncEventStatus.FAILED,
        retryCount: 3,
        maxRetries: 3,
        errorMessage: 'NAS connection timeout',
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.FAILED) return [failedEvent];
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        status: SyncEventStatus.FAILED,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(1);
      expect(result.events[0].status).toBe(SyncEventStatus.FAILED);
      expect(result.events[0].errorMessage).toBe('NAS connection timeout');
      expect(result.summary.failed).toBe(1);
    });

    /**
     * 📌 테스트 시나리오: 상태 미지정 시 모든 상태 이벤트 조회 (DONE 포함)
     *
     * 🎯 검증 목적:
     *   status 파라미터 없이 호출하면 PENDING, PROCESSING, FAILED, DONE
     *   모든 상태의 이벤트를 한번에 조회하여 전체 상황을 파악할 수 있어야 함
     *
     * ✅ 기대 결과:
     *   - PENDING, PROCESSING, FAILED, DONE 상태 모두 조회됨
     */
    it('should return all events (including DONE) when status is not specified', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const pendingEvent = new SyncEventEntity({
        id: 'event-p1',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-p1',
        sourcePath: '/cache/p1.pdf',
        targetPath: '/nas/p1.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      const processingEvent = new SyncEventEntity({
        id: 'event-pr1',
        eventType: SyncEventType.MOVE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-pr1',
        sourcePath: '/cache/pr1.pdf',
        targetPath: '/nas/pr1.pdf',
        status: SyncEventStatus.PROCESSING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      const failedEvent = new SyncEventEntity({
        id: 'event-f1',
        eventType: SyncEventType.DELETE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-f1',
        sourcePath: '/cache/f1.pdf',
        targetPath: '/nas/f1.pdf',
        status: SyncEventStatus.FAILED,
        retryCount: 3,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      const doneEvent = new SyncEventEntity({
        id: 'event-d1',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-d1',
        sourcePath: '/cache/d1.pdf',
        targetPath: '/nas/d1.pdf',
        status: SyncEventStatus.DONE,
        retryCount: 0,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.PENDING) return [pendingEvent];
        if (status === SyncEventStatus.PROCESSING) return [processingEvent];
        if (status === SyncEventStatus.FAILED) return [failedEvent];
        if (status === SyncEventStatus.DONE) return [doneEvent];
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(4);
      expect(result.summary.pending).toBe(1);
      expect(result.summary.processing).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.done).toBe(1);
      expect(result.summary.total).toBe(4);
    });

    /**
     * 📌 테스트 시나리오: 이벤트 타입별 필터링
     *
     * 🎯 검증 목적:
     *   특정 이벤트 타입(SYNC, MOVE, DELETE 등)만 조회하여
     *   특정 작업 유형의 문제만 분석할 수 있어야 함
     *
     * ✅ 기대 결과:
     *   - 지정된 eventType에 해당하는 이벤트만 반환됨
     */
    it('should filter events by event type', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const syncEvent = new SyncEventEntity({
        id: 'event-sync',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-sync',
        sourcePath: '/cache/sync.pdf',
        targetPath: '/nas/sync.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      const moveEvent = new SyncEventEntity({
        id: 'event-move',
        eventType: SyncEventType.MOVE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-move',
        sourcePath: '/cache/move.pdf',
        targetPath: '/nas/move.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.PENDING) return [syncEvent, moveEvent];
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        status: SyncEventStatus.PENDING,
        eventType: SyncEventType.CREATE,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe(SyncEventType.CREATE);
    });

    /**
     * 📌 테스트 시나리오: 페이징 적용
     *
     * 🎯 검증 목적:
     *   대량의 이벤트가 있을 때 페이징을 통해
     *   지정된 범위의 이벤트만 조회할 수 있어야 함
     *
     * ✅ 기대 결과:
     *   - offset, limit에 맞게 이벤트가 반환됨
     */
    it('should apply pagination correctly', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const events = Array.from({ length: 10 }, (_, i) =>
        new SyncEventEntity({
          id: `event-${i}`,
          eventType: SyncEventType.CREATE,
          targetType: SyncEventTargetType.FILE,
          fileId: `file-${i}`,
          sourcePath: `/cache/file${i}.pdf`,
          targetPath: `/nas/file${i}.pdf`,
          status: SyncEventStatus.PENDING,
          retryCount: 0,
          maxRetries: 3,
          createdAt: oneHourAgo,
          updatedAt: oneHourAgo,
        }),
      );

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.PENDING) return events;
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        status: SyncEventStatus.PENDING,
        hours: 24,
        limit: 3,
        offset: 2,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(3);
      expect(result.events[0].id).toBe('event-2');
      expect(result.events[2].id).toBe('event-4');
      expect(result.summary.total).toBe(10); // 전체 개수는 10
    });

    /**
     * 📌 테스트 시나리오: 시간 범위 필터링
     *
     * 🎯 검증 목적:
     *   지정된 시간(hours) 내에 생성된 이벤트만 조회하여
     *   최근 문제에 집중할 수 있어야 함
     *
     * ✅ 기대 결과:
     *   - hours 범위 밖의 이벤트는 제외됨
     */
    it('should filter events by time range (hours)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const recentEvent = new SyncEventEntity({
        id: 'event-recent',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-recent',
        sourcePath: '/cache/recent.pdf',
        targetPath: '/nas/recent.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      const oldEvent = new SyncEventEntity({
        id: 'event-old',
        eventType: SyncEventType.CREATE,
        targetType: SyncEventTargetType.FILE,
        fileId: 'file-old',
        sourcePath: '/cache/old.pdf',
        targetPath: '/nas/old.pdf',
        status: SyncEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo,
      });

      syncEventRepo.findByStatus.mockImplementation(async (status) => {
        if (status === SyncEventStatus.PENDING) return [recentEvent, oldEvent];
        return [];
      });

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행) - 24시간 이내만 조회
      // ═══════════════════════════════════════════════════════
      const result = await service.findSyncEvents({
        status: SyncEventStatus.PENDING,
        hours: 24,
        limit: 100,
        offset: 0,
      });

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('event-recent');
    });
  });
});
